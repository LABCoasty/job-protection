"""Search service with automatic failover: Google CSE → Tavily → Brave → SearXNG.

Each provider returns None on error (network, quota, auth) so the dispatcher
tries the next one. Returns [] only when the search succeeded but had no hits.
"""

import time
import httpx
from config import get_config


def _search_google_cse(query: str, api_key: str, cse_id: str, max_results: int = 5):
    """Returns list[dict] on success, None on error (network, quota, auth)."""
    url = "https://www.googleapis.com/customsearch/v1"
    try:
        with httpx.Client(timeout=10.0) as client:
            r = client.get(url, params={
                "key": api_key,
                "cx": cse_id,
                "q": query,
                "num": min(max_results, 10),
            })
        if r.status_code in (403, 429):
            return None  # quota exhausted or permission issue → try next provider
        r.raise_for_status()
        data = r.json()
    except (httpx.HTTPError, httpx.RequestError, ValueError):
        return None
    results = data.get("items") or []
    return [{
        "title": item.get("title") or "",
        "url": item.get("link") or "",
        "content": item.get("snippet") or "",
    } for item in results[:max_results] if isinstance(item, dict)]


def _search_tavily(query: str, api_key: str, max_results: int = 5):
    """Returns list[dict] on success, None on error."""
    url = "https://api.tavily.com/search"
    try:
        with httpx.Client(timeout=15.0) as client:
            r = client.post(
                url,
                headers={"Content-Type": "application/json"},
                json={
                    "api_key": api_key,
                    "query": query,
                    "max_results": max_results,
                    "search_depth": "basic",
                },
            )
        if r.status_code in (401, 403, 429):
            return None
        r.raise_for_status()
        data = r.json()
    except (httpx.HTTPError, httpx.RequestError, ValueError):
        return None
    results = data.get("results") or []
    return [{
        "title": item.get("title") or "",
        "url": item.get("url") or "",
        "content": item.get("content") or "",
    } for item in results[:max_results] if isinstance(item, dict)]


def _search_brave(query: str, api_key: str, max_results: int = 5):
    """Returns list[dict] on success, None on error."""
    url = "https://api.search.brave.com/res/v1/web/search"
    try:
        with httpx.Client(timeout=10.0) as client:
            r = client.get(
                url,
                headers={
                    "Accept": "application/json",
                    "X-Subscription-Token": api_key,
                },
                params={"q": query, "count": max_results},
            )
        if r.status_code in (401, 403, 429):
            return None
        r.raise_for_status()
        data = r.json()
    except (httpx.HTTPError, httpx.RequestError, ValueError):
        return None
    results = (data.get("web") or {}).get("results") or []
    return [{
        "title": item.get("title") or "",
        "url": item.get("url") or "",
        "content": item.get("description") or "",
    } for item in results[:max_results] if isinstance(item, dict)]


def _search_searxng(query: str, base_url: str, max_results: int = 5):
    """Returns list[dict] on success, None on error."""
    url = f"{base_url.rstrip('/')}/search"
    try:
        with httpx.Client(timeout=10.0) as client:
            r = client.get(url, params={"q": query, "format": "json"})
            r.raise_for_status()
            data = r.json()
    except (httpx.HTTPError, httpx.RequestError, ValueError):
        return None
    results = data.get("results") or []
    return [{
        "title": item.get("title") or "",
        "url": item.get("url") or "",
        "content": item.get("content") or "",
    } for item in results[:max_results] if isinstance(item, dict)]


def _active_providers():
    """Return ordered list of (name, callable) for configured providers."""
    config = get_config()
    providers = []
    if config.get("google_cse_api_key") and config.get("google_cse_id"):
        providers.append((
            "google",
            lambda q, n: _search_google_cse(q, config["google_cse_api_key"], config["google_cse_id"], n),
        ))
    if config.get("tavily_api_key"):
        providers.append((
            "tavily",
            lambda q, n: _search_tavily(q, config["tavily_api_key"], n),
        ))
    if config.get("brave_api_key"):
        providers.append((
            "brave",
            lambda q, n: _search_brave(q, config["brave_api_key"], n),
        ))
    # SearXNG is always the last-resort fallback
    providers.append((
        "searxng",
        lambda q, n: _search_searxng(q, config["searxng_url"], n),
    ))
    return providers


def search(query: str, max_results: int = 5) -> list[dict]:
    """Try providers in order; return first non-None result, else []."""
    for _name, fn in _active_providers():
        result = fn(query, max_results)
        if result is not None:
            return result
    return []


_EVIDENCE_AXES = [
    (
        "legitimacy",
        'Legitimacy & basic existence',
        '"{company}" company about OR "headquartered in" OR founded',
    ),
    (
        "fraud",
        'Fraud, scam, and ghost-job signals',
        '"{company}" scam OR fraud OR "ghost job" OR complaint OR "fake job"',
    ),
    (
        "reviews",
        'Employee & customer reviews',
        '"{company}" reviews Glassdoor OR Trustpilot OR Indeed',
    ),
    (
        "legal",
        'Lawsuits, court cases, regulatory action',
        '"{company}" lawsuit OR "class action" OR "wage theft" OR SEC OR FTC',
    ),
    (
        "layoffs",
        'Layoffs and financial health',
        '"{company}" layoffs OR "mass layoff" OR bankruptcy OR "round of cuts"',
    ),
    (
        "data_privacy",
        'Data handling & privacy policy (do they sell your data?)',
        '"{company}" privacy policy "sell" OR "share personal" OR "third parties" OR "do not sell"',
    ),
]


def gather_evidence(company_name: str, domain: str | None = None) -> str:
    """Deep-dive company investigation across multiple axes.

    Returns a single labeled text block for the LLM, structured as:

        === Legitimacy & basic existence ===
        [Title] snippet
        [Title] snippet

        === Fraud, scam, and ghost-job signals ===
        ...

    Returns 'No external search results available.' if nothing turned up.
    """
    if not company_name:
        return "No company name provided."

    providers = _active_providers()
    needs_throttle = any(name == "brave" for name, _ in providers)

    sections: list[str] = []
    queries: list[tuple[str, str]] = []  # (axis_label, full_query)
    for _key, label, template in _EVIDENCE_AXES:
        queries.append((label, template.format(company=company_name)))
    if domain and domain.lower() not in company_name.lower():
        queries.append((
            "Domain verification",
            f'"{domain}" OR site:{domain} legitimacy OR reviews OR reputation',
        ))

    for idx, (label, q) in enumerate(queries):
        hits = search(q, max_results=4)
        lines: list[str] = []
        for hit in hits:
            snippet = (hit.get("content") or "").strip()
            if not snippet:
                continue
            title = (hit.get("title") or "").strip()
            url = (hit.get("url") or "").strip()
            host = ""
            if url:
                m = url.split("//", 1)[-1].split("/", 1)[0]
                host = m
            header = f"[{title}] ({host})" if host else f"[{title}]"
            lines.append(f"{header}\n{snippet}")
        if lines:
            sections.append(f"=== {label} ===\n" + "\n\n".join(lines))
        if needs_throttle and idx < len(queries) - 1:
            time.sleep(1.1)

    return "\n\n".join(sections) if sections else "No external search results available."
