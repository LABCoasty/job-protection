"""LLM analysis service: uses Groq (hosted) when GROQ_API_KEY is set, else local Ollama."""

import json
import re
import httpx

from config import get_config
from schemas import CompanySignal, JobPostSignal


def _build_prompt(snapshot: dict, description: str, search_evidence: str, resume: str = "") -> str:
    return f"""You are a job listing fraud analyst protecting a jobseeker from ghost jobs, scams, and untrustworthy employers. You have been given a job posting plus a deep-dive web investigation of the company across multiple axes (legitimacy, fraud reports, reviews, legal actions, layoffs, data-privacy practices).

IMPORTANT: The "Title" and "Company" fields in the metadata below may be missing or say "Unknown (extract from description)" — this means the browser extension could not scrape them. In that case, YOU must extract the real jobTitle and companyName from the job description text, and include them as "extractedJobTitle" and "extractedCompanyName" at the top level of your JSON response. Also extract location, salary range, and employment type into "extractedLocation", "extractedSalary", "extractedEmploymentType" when present in the description. If a field is genuinely unavailable, use an empty string.

Analyze ALL of this evidence carefully. For companySignals, create one signal for EACH of the evidence axes present in the external evidence — use the section headers ("Legitimacy & basic existence", "Fraud, scam, and ghost-job signals", "Employee & customer reviews", "Lawsuits, court cases, regulatory action", "Layoffs and financial health", "Data handling & privacy policy (do they sell your data?)") to guide you. If an axis has no evidence, mark it "warn" with evidence noting the gap. If an axis has positive evidence (e.g., company is in SEC filings, clear privacy policy that doesn't sell data), mark it "good". If concerning (scam reports, lawsuits, mass layoffs, data sold to third parties), mark it "bad".

Output only valid JSON (no markdown, no extra text) with this exact structure:

{{
  "extractedJobTitle": "<real title from description>",
  "extractedCompanyName": "<real company from description>",
  "extractedLocation": "<location or empty>",
  "extractedSalary": "<salary range or empty>",
  "extractedEmploymentType": "<Full-time/Part-time/Contract or empty>",
  "trustScore": <0-100 integer: how trustworthy is this listing + company>,
  "riskLevel": "low" | "medium" | "high",
  "primaryWarning": "<one sentence summary for the user — lead with the biggest concern or biggest green flag>",
  "jobPostSignals": [
    {{ "id": "1", "status": "good"|"warn"|"bad", "label": "<short label>", "evidence": "<one sentence citing the listing or description>" }}
  ],
  "companySignals": [
    {{ "id": "1", "status": "good"|"warn"|"bad", "label": "<short label>", "evidence": "<one sentence citing specific external evidence>" }}
  ],
  "resumeMatch": {{
    "score": <0-100 integer: how well the resume matches the job, or 0 if no resume>,
    "summary": "<one sentence overall fit assessment, or 'No resume provided' if no resume>",
    "strengths": ["<specific resume strength that matches the job>", "..."],
    "gaps": ["<specific job requirement the resume does not clearly demonstrate>", "..."]
  }}
}}

Rules:
- Always perform the extraction above, even if the original Title/Company were provided (validate them against the description).
- jobPostSignals: 5-8 signals about the listing itself (salary presence, description quality, urgency language, contact legitimacy, etc.)
- companySignals: 6 signals, one per investigation axis above, using the external evidence directly.
- Evidence strings must reference what you actually observed — never fabricate.
- Base your analysis on the ACTUAL description content, not the possibly-stale Title/Company metadata.
- resumeMatch: If a resume section is provided below, compare the candidate's skills, experience, and education to the job requirements; give a calibrated 0-100 fit score with concrete strengths (3-5) and gaps (2-4). If NO resume is provided, set score=0, summary="No resume provided", strengths=[], gaps=[].

Job listing metadata:
- Title: {snapshot.get('jobTitle', '')}
- Company: {snapshot.get('companyName', '')}
- Platform: {snapshot.get('platform', '')}
- Location: {snapshot.get('location', '')}
- Employment type: {snapshot.get('employmentType', '')}
- Posted: {snapshot.get('postedDate', '')}
- Applicants: {snapshot.get('applicantCount', '')}
- Salary mentioned: {snapshot.get('salaryMentioned', False)}
- Has responsibilities: {snapshot.get('responsibilitiesPresent', False)}
- Has requirements: {snapshot.get('requirementsPresent', False)}
- Has benefits: {snapshot.get('benefitsPresent', False)}
- Contact info: {snapshot.get('contactInfo') or 'none'}
- Recruiter: {snapshot.get('recruiterVisible') or 'none'}
- Description length: {snapshot.get('descriptionLength', 0)} chars

Job description (from the selected detail pane — read ALL of it; the real
job title and company name live in here, the metadata fields above may be
stale scraper output):
{description[:14000] if description else 'No description provided.'}

External company investigation (labeled sections):
{search_evidence[:6000] if search_evidence else 'No external evidence.'}

Candidate resume (for job-match analysis):
{resume[:6000] if resume else 'No resume provided — return resumeMatch with score=0 and summary="No resume provided".'}

Output only the JSON object, nothing else."""


def _parse_json(response_text: str) -> dict | None:
    """Extract JSON from model response (may be wrapped in markdown code blocks)."""
    text = (response_text or "").strip()
    m = re.search(r"```(?:json)?\s*([\s\S]*?)```", text)
    if m:
        text = m.group(1).strip()
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        return None


def _call_groq(prompt: str, api_key: str, model: str) -> str | None:
    """Call Groq chat completions (OpenAI-compatible). Returns raw JSON string content."""
    url = "https://api.groq.com/openai/v1/chat/completions"
    try:
        with httpx.Client(timeout=60.0) as client:
            r = client.post(
                url,
                headers={
                    "Authorization": f"Bearer {api_key}",
                    "Content-Type": "application/json",
                },
                json={
                    "model": model,
                    "messages": [{"role": "user", "content": prompt}],
                    "response_format": {"type": "json_object"},
                    "temperature": 0.2,
                },
            )
            r.raise_for_status()
            data = r.json()
    except (httpx.HTTPError, httpx.RequestError, ValueError, KeyError):
        return None
    try:
        return data["choices"][0]["message"]["content"]
    except (KeyError, IndexError, TypeError):
        return None


def _call_ollama(prompt: str, base_url: str, model: str) -> str | None:
    """Call local Ollama generate endpoint. Returns raw JSON string content."""
    url = f"{base_url.rstrip('/')}/api/generate"
    try:
        with httpx.Client(timeout=120.0) as client:
            r = client.post(
                url,
                json={
                    "model": model,
                    "prompt": prompt,
                    "stream": False,
                    "format": "json",
                },
            )
            r.raise_for_status()
            data = r.json()
    except (httpx.HTTPError, httpx.RequestError, ValueError, KeyError):
        return None
    return data.get("response") or ""


def _normalize(parsed: dict) -> dict:
    """Clamp + coerce model JSON into our ScanResult shape."""
    trust_score = parsed.get("trustScore")
    if trust_score is not None:
        try:
            trust_score = max(0, min(100, int(trust_score)))
        except (TypeError, ValueError):
            trust_score = 50
    else:
        trust_score = 50
    risk = parsed.get("riskLevel") or "medium"
    if risk not in ("low", "medium", "high"):
        risk = "medium"
    job_signals = []
    for i, s in enumerate(parsed.get("jobPostSignals") or []):
        if not isinstance(s, dict):
            continue
        job_signals.append(
            JobPostSignal(
                id=str(s.get("id", i + 1)),
                status=s.get("status") or "warn",
                label=s.get("label") or "",
                evidence=s.get("evidence") or "",
            )
        )
    company_signals = []
    for i, s in enumerate(parsed.get("companySignals") or []):
        if not isinstance(s, dict):
            continue
        company_signals.append(
            CompanySignal(
                id=str(s.get("id", i + 1)),
                status=s.get("status") or "warn",
                label=s.get("label") or "",
                evidence=s.get("evidence") or "",
            )
        )
    return {
        "trustScore": trust_score,
        "riskLevel": risk,
        "primaryWarning": parsed.get("primaryWarning") or "Analysis complete.",
        "jobPostSignals": job_signals,
        "companySignals": company_signals,
        "extractedJobTitle": (parsed.get("extractedJobTitle") or "").strip(),
        "extractedCompanyName": (parsed.get("extractedCompanyName") or "").strip(),
        "extractedLocation": (parsed.get("extractedLocation") or "").strip(),
        "extractedSalary": (parsed.get("extractedSalary") or "").strip(),
        "extractedEmploymentType": (parsed.get("extractedEmploymentType") or "").strip(),
    }


def parse_resume(resume_text: str) -> dict | None:
    """Structure a resume text into name/email/skills/etc. using the LLM."""
    if not resume_text or len(resume_text) < 50:
        return None
    prompt = (
        "Parse this resume into structured JSON. Output ONLY valid JSON, no markdown.\n\n"
        "Full schema (ALL keys must be present; use empty string \"\" / empty array [] / null when absent):\n"
        '{\n'
        '  "name": "<full legal name>",\n'
        '  "preferredName": "<first name or nickname used professionally, else same as first-name-of-name>",\n'
        '  "firstName": "<given name>",\n'
        '  "middleName": "<middle name(s) or empty>",\n'
        '  "lastName": "<family name>",\n'
        '  "pronouns": "<e.g. she/her, they/them, or empty>",\n'
        '  "email": "<primary email>",\n'
        '  "phone": "<phone with country code if present, e.g. +1 415-555-1234>",\n'
        '  "address": {\n'
        '    "street": "<street + unit/apt>",\n'
        '    "city": "",\n'
        '    "state": "<2-letter code for US states, else full region name>",\n'
        '    "postalCode": "",\n'
        '    "country": "<country name, default United States if US state present>"\n'
        '  },\n'
        '  "location": "<\'City, ST ZIP\' or \'City, State\' — backward-compat shorthand>",\n'
        '  "currentTitle": "<most recent job title>",\n'
        '  "yearsOfExperience": "<approximate total years, e.g. \'5+\'>",\n'
        '  "summary": "<one-sentence professional summary>",\n'
        '  "workAuthorization": "<e.g. US citizen, H-1B visa, needs sponsorship, or empty>",\n'
        '  "links": {\n'
        '    "linkedin": "<full https URL or empty>",\n'
        '    "github": "<full https URL or empty>",\n'
        '    "portfolio": "<full https URL of personal site or empty>",\n'
        '    "twitter": "<full https URL or empty>"\n'
        '  },\n'
        '  "skills": ["<deduped concrete technical/professional skills, most relevant first>"],\n'
        '  "topCompanies": ["<most recent 2-5 employer names>"],\n'
        '  "languages": ["<spoken languages with proficiency if given, e.g. \'English (native)\'>"],\n'
        '  "workHistory": [\n'
        '    {\n'
        '      "title": "<job title>",\n'
        '      "company": "<employer>",\n'
        '      "location": "<city/state or empty>",\n'
        '      "startDate": "<MM/YYYY or \'Jan 2022\'>",\n'
        '      "endDate": "<MM/YYYY or \'Present\'>",\n'
        '      "current": <true if this is the current role>,\n'
        '      "description": "<one-to-two sentence role summary, results-oriented>"\n'
        '    }\n'
        '  ],\n'
        '  "education": [\n'
        '    {\n'
        '      "institution": "<school name>",\n'
        '      "degree": "<BS, MS, PhD, BA, MBA, etc., or empty>",\n'
        '      "fieldOfStudy": "<major or area of study>",\n'
        '      "startDate": "<MM/YYYY or YYYY>",\n'
        '      "endDate": "<MM/YYYY, YYYY, or \'Expected 2026\'>",\n'
        '      "gpa": "<e.g. 3.8/4.0 or empty>"\n'
        '    }\n'
        '  ],\n'
        '  "certifications": [\n'
        '    { "name": "<cert name>", "issuer": "<org>", "date": "<MM/YYYY or YYYY>" }\n'
        '  ]\n'
        "}\n\n"
        "Guidelines:\n"
        "- Prefer the resume's own wording; don't rephrase job titles or company names.\n"
        "- workHistory + education: most recent first, up to 5 entries each.\n"
        "- firstName/middleName/lastName: split from 'name' even if middle is missing.\n"
        "- preferredName: if the resume uses a nickname in a header or summary, use that; otherwise same as firstName.\n"
        "- address.state: if the US, emit the 2-letter code (CA, NY, TX…). If non-US, emit the full region/province.\n"
        "- location: keep as 'City, ST ZIP' when ZIP present, else 'City, ST' — used as a fallback by older clients.\n"
        "- links.*: must be FULL https URLs (https://www.linkedin.com/in/...), never bare usernames.\n"
        "- If the resume doesn't mention work authorization, leave it empty. Don't guess.\n"
        "- skills: prefer the resume's own wording, dedupe, cap at 30.\n\n"
        "Resume text:\n"
        + resume_text[:16000]
    )
    config = get_config()
    if config.get("groq_api_key"):
        raw = _call_groq(prompt, config["groq_api_key"], config["groq_model"])
    else:
        raw = _call_ollama(prompt, config["ollama_url"], config["ollama_model"])
    if not raw:
        return None
    parsed = _parse_json(raw)
    if not isinstance(parsed, dict):
        return None

    def _strs(v):
        if not isinstance(v, list):
            return []
        return [str(x).strip() for x in v if isinstance(x, (str, int, float)) and str(x).strip()]

    def _str(v):
        return (v if isinstance(v, str) else "").strip()

    links_raw = parsed.get("links") if isinstance(parsed.get("links"), dict) else {}
    address_raw = parsed.get("address") if isinstance(parsed.get("address"), dict) else {}

    work_history = []
    for item in (parsed.get("workHistory") or [])[:5]:
        if not isinstance(item, dict):
            continue
        work_history.append({
            "title": _str(item.get("title")),
            "company": _str(item.get("company")),
            "location": _str(item.get("location")),
            "startDate": _str(item.get("startDate")),
            "endDate": _str(item.get("endDate")),
            "current": bool(item.get("current")),
            "description": _str(item.get("description")),
        })

    education = []
    for item in (parsed.get("education") or [])[:5]:
        if isinstance(item, dict):
            education.append({
                "institution": _str(item.get("institution")),
                "degree": _str(item.get("degree")),
                "fieldOfStudy": _str(item.get("fieldOfStudy")),
                "startDate": _str(item.get("startDate")),
                "endDate": _str(item.get("endDate")),
                "gpa": _str(item.get("gpa")),
            })
        elif isinstance(item, str):
            # Backward compat: older prompts returned strings.
            education.append({
                "institution": item.strip(),
                "degree": "",
                "fieldOfStudy": "",
                "startDate": "",
                "endDate": "",
                "gpa": "",
            })

    certifications = []
    for item in (parsed.get("certifications") or [])[:10]:
        if not isinstance(item, dict):
            continue
        certifications.append({
            "name": _str(item.get("name")),
            "issuer": _str(item.get("issuer")),
            "date": _str(item.get("date")),
        })

    # Derive first/last when the LLM didn't split them.
    full_name = _str(parsed.get("name"))
    first_name = _str(parsed.get("firstName"))
    last_name = _str(parsed.get("lastName"))
    middle_name = _str(parsed.get("middleName"))
    if full_name and not (first_name or last_name):
        parts = full_name.split()
        if parts:
            first_name = first_name or parts[0]
            if len(parts) >= 2:
                last_name = last_name or parts[-1]
            if len(parts) >= 3:
                middle_name = middle_name or " ".join(parts[1:-1])

    return {
        "name": full_name,
        "firstName": first_name,
        "middleName": middle_name,
        "lastName": last_name,
        "preferredName": _str(parsed.get("preferredName")) or first_name,
        "pronouns": _str(parsed.get("pronouns")),
        "email": _str(parsed.get("email")),
        "phone": _str(parsed.get("phone")),
        "location": _str(parsed.get("location")),
        "address": {
            "street": _str(address_raw.get("street")),
            "city": _str(address_raw.get("city")),
            "state": _str(address_raw.get("state")),
            "postalCode": _str(address_raw.get("postalCode")),
            "country": _str(address_raw.get("country")),
        },
        "currentTitle": _str(parsed.get("currentTitle")),
        "yearsOfExperience": _str(parsed.get("yearsOfExperience")),
        "summary": _str(parsed.get("summary")),
        "workAuthorization": _str(parsed.get("workAuthorization")),
        "links": {
            "linkedin": _str(links_raw.get("linkedin")),
            "github": _str(links_raw.get("github")),
            "portfolio": _str(links_raw.get("portfolio")),
            "twitter": _str(links_raw.get("twitter")),
        },
        "skills": _strs(parsed.get("skills"))[:30],
        "topCompanies": _strs(parsed.get("topCompanies"))[:10],
        "languages": _strs(parsed.get("languages"))[:10],
        "workHistory": work_history,
        "education": education,
        "certifications": certifications,
    }


def preextract_fields(description: str) -> dict | None:
    """Fast LLM call to pull job title / company / location from raw description.

    Used when the browser extension couldn't scrape them, so we have a real
    company name to feed the deep-dive search BEFORE the main analysis call.
    """
    if not description or len(description) < 50:
        return None
    prompt = (
        "Extract the following fields from this job listing text. "
        "Output ONLY valid JSON, no markdown. Use empty strings when unclear.\n\n"
        "Required fields:\n"
        "  jobTitle, companyName, location, salary, employmentType\n\n"
        "Listing text:\n" + description[:6000]
    )
    config = get_config()
    if config.get("groq_api_key"):
        raw = _call_groq(prompt, config["groq_api_key"], config["groq_model"])
    else:
        raw = _call_ollama(prompt, config["ollama_url"], config["ollama_model"])
    if not raw:
        return None
    parsed = _parse_json(raw)
    if not parsed or not isinstance(parsed, dict):
        return None
    return {
        "jobTitle": (parsed.get("jobTitle") or "").strip(),
        "companyName": (parsed.get("companyName") or "").strip(),
        "location": (parsed.get("location") or "").strip(),
        "salary": (parsed.get("salary") or "").strip(),
        "employmentType": (parsed.get("employmentType") or "").strip(),
    }


def analyze(
    snapshot: dict,
    description: str,
    search_evidence: str,
    resume: str = "",
) -> dict | None:
    """
    Analyze listing with Groq (hosted) if GROQ_API_KEY set, else local Ollama.
    Returns normalized dict, or None if the provider fails / returns invalid JSON.
    """
    config = get_config()
    prompt = _build_prompt(snapshot, description or "", search_evidence or "", resume or "")
    if config.get("groq_api_key"):
        raw = _call_groq(prompt, config["groq_api_key"], config["groq_model"])
    else:
        raw = _call_ollama(prompt, config["ollama_url"], config["ollama_model"])
    if not raw:
        return None
    parsed = _parse_json(raw)
    if not parsed or not isinstance(parsed, dict):
        return None
    result = _normalize(parsed)
    # Preserve the resumeMatch block from the raw response.
    rm = parsed.get("resumeMatch")
    if isinstance(rm, dict):
        try:
            score = int(rm.get("score") or 0)
        except (TypeError, ValueError):
            score = 0
        score = max(0, min(100, score))
        result["resumeMatch"] = {
            "score": score,
            "summary": (rm.get("summary") or "").strip() or "No resume provided",
            "strengths": [s for s in (rm.get("strengths") or []) if isinstance(s, str) and s.strip()],
            "gaps": [g for g in (rm.get("gaps") or []) if isinstance(g, str) and g.strip()],
        }
    return result
