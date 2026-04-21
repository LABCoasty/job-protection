"""Search service: dispatches to Google CSE → Brave → SearXNG based on env config."""

import time
import httpx
from config import get_config


def _search_google_cse(query: str, api_key: str, cse_id: str, max_results: int = 5) -> list[dict]:
    """Call Google Custom Search JSON API. Returns normalized list of {title, url, content}."""
    url = "https://www.googleapis.com/customsearch/v1"
    try:
        with httpx.Client(timeout=10.0) as client:
            r = client.get(
                url,
                params={
                    "key": api_key,
                    "cx": cse_id,
                    "q": query,
                    "num": min(max_results, 10),
                },
            )
            r.raise_for_status()
            data = r.json()
    except (httpx.HTTPError, httpx.RequestError, ValueError):
        return []
    results = data.get("items") or []
    out = []
    for item in results[:max_results]:
        if not isinstance(item, dict):
            continue
        out.append({
            "title": item.get("title") or "",
            "url": item.get("link") or "",
            "content": item.get("snippet") or "",
        })
    return out


def _search_brave(query: str, api_key: str, max_results: int = 5) -> list[dict]:
    """Call Brave Web Search API. Returns normalized list of {title, url, content}."""
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
            r.raise_for_status()
            data = r.json()
    except (httpx.HTTPError, httpx.RequestError, ValueError):
        return []
    results = (data.get("web") or {}).get("results") or []
    out = []
    for item in results[:max_results]:
        if not isinstance(item, dict):
            continue
        out.append({
            "title": item.get("title") or "",
            "url": item.get("url") or "",
            "content": item.get("description") or "",
        })
    return out


def _search_searxng(query: str, base_url: str, max_results: int = 5) -> list[dict]:
    """Call local SearXNG JSON search. Returns normalized list of {title, url, content}."""
    url = f"{base_url.rstrip('/')}/search"
    try:
        with httpx.Client(timeout=10.0) as client:
            r = client.get(url, params={"q": query, "format": "json"})
            r.raise_for_status()
            data = r.json()
    except (httpx.HTTPError, httpx.RequestError, ValueError):
        return []
    results = data.get("results") or []
    out = []
    for item in results[:max_results]:
        if not isinstance(item, dict):
            continue
        out.append({
            "title": item.get("title") or "",
            "url": item.get("url") or "",
            "content": item.get("content") or "",
        })
    return out


def _provider() -> str:
    """Return which provider will be used: 'google' | 'brave' | 'searxng'."""
    config = get_config()
    if config.get("google_cse_api_key") and config.get("google_cse_id"):
        return "google"
    if config.get("brave_api_key"):
        return "brave"
    return "searxng"


def search(query: str, max_results: int = 5) -> list[dict]:
    """Dispatch a single search query to the active provider."""
    config = get_config()
    provider = _provider()
    if provider == "google":
        return _search_google_cse(
            query, config["google_cse_api_key"], config["google_cse_id"], max_results
        )
    if provider == "brave":
        return _search_brave(query, config["brave_api_key"], max_results)
    return _search_searxng(query, config["searxng_url"], max_results)


def gather_evidence(company_name: str, domain: str | None = None) -> str:
    """
    Run 2-3 queries to verify company legitimacy and scam reports.
    Returns a single text block of evidence snippets for the LLM.
    """
    parts = []
    queries: list[str] = []
    if company_name:
        queries.append(f'"{company_name}" official website')
        queries.append(f'"{company_name}" company scam reviews')
    if domain:
        queries.append(f'"{domain}" reviews legitimacy')

    # Brave free tier: 1 req/sec. Google CSE and SearXNG don't need throttling.
    needs_throttle = _provider() == "brave"
    for idx, q in enumerate(queries):
        for hit in search(q, max_results=3):
            if hit.get("content"):
                parts.append(f"[{hit.get('title', '')}]\n{hit['content']}")
        if needs_throttle and idx < len(queries) - 1:
            time.sleep(1.1)

    return "\n\n---\n\n".join(parts) if parts else "No external search results available."
