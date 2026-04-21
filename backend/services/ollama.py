"""LLM analysis service: uses Groq (hosted) when GROQ_API_KEY is set, else local Ollama."""

import json
import re
import httpx

from config import get_config
from schemas import CompanySignal, JobPostSignal


def _build_prompt(snapshot: dict, description: str, search_evidence: str) -> str:
    return f"""You are a job listing fraud analyst protecting a jobseeker from ghost jobs, scams, and untrustworthy employers. You have been given a job posting plus a deep-dive web investigation of the company across multiple axes (legitimacy, fraud reports, reviews, legal actions, layoffs, data-privacy practices).

Analyze ALL of this evidence carefully. For companySignals, create one signal for EACH of the evidence axes present in the external evidence — use the section headers ("Legitimacy & basic existence", "Fraud, scam, and ghost-job signals", "Employee & customer reviews", "Lawsuits, court cases, regulatory action", "Layoffs and financial health", "Data handling & privacy policy (do they sell your data?)") to guide you. If an axis has no evidence, mark it "warn" with evidence noting the gap. If an axis has positive evidence (e.g., company is in SEC filings, clear privacy policy that doesn't sell data), mark it "good". If concerning (scam reports, lawsuits, mass layoffs, data sold to third parties), mark it "bad".

Output only valid JSON (no markdown, no extra text) with this exact structure:

{{
  "trustScore": <0-100 integer: how trustworthy is this listing + company>,
  "riskLevel": "low" | "medium" | "high",
  "primaryWarning": "<one sentence summary for the user — lead with the biggest concern or biggest green flag>",
  "jobPostSignals": [
    {{ "id": "1", "status": "good"|"warn"|"bad", "label": "<short label>", "evidence": "<one sentence citing the listing or description>" }}
  ],
  "companySignals": [
    {{ "id": "1", "status": "good"|"warn"|"bad", "label": "<short label>", "evidence": "<one sentence citing specific external evidence>" }}
  ]
}}

Rules:
- jobPostSignals: 5-8 signals about the listing itself (salary presence, description quality, urgency language, contact legitimacy, etc.)
- companySignals: 6 signals, one per investigation axis above, using the external evidence directly.
- Evidence strings must reference what you actually observed — never fabricate.
- If companyName is "Unknown company" or the listing has almost no content, set trustScore low and flag the extraction failure clearly.

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

Job description (excerpt):
{description[:4000] if description else 'No description provided.'}

External company investigation (labeled sections):
{search_evidence[:6000] if search_evidence else 'No external evidence.'}

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
    }


def analyze(snapshot: dict, description: str, search_evidence: str) -> dict | None:
    """
    Analyze listing with Groq (hosted) if GROQ_API_KEY set, else local Ollama.
    Returns normalized dict, or None if the provider fails / returns invalid JSON.
    """
    config = get_config()
    prompt = _build_prompt(snapshot, description or "", search_evidence or "")
    if config.get("groq_api_key"):
        raw = _call_groq(prompt, config["groq_api_key"], config["groq_model"])
    else:
        raw = _call_ollama(prompt, config["ollama_url"], config["ollama_model"])
    if not raw:
        return None
    parsed = _parse_json(raw)
    if not parsed or not isinstance(parsed, dict):
        return None
    return _normalize(parsed)
