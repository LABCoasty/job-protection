"""Search service with automatic failover: Google CSE → Brave → SearXNG.

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


def gather_evidence(company_name: str, domain: str | None = None) -> str:
    """Run 2-3 queries to verify company legitimacy; returns a snippets block."""
    parts = []
    queries: list[str] = []
    if company_name:
        queries.append(f'"{company_name}" official website')
        queries.append(f'"{company_name}" company scam reviews')
    if domain:
        queries.append(f'"{domain}" reviews legitimacy')

    # Brave free tier: 1 req/sec. Throttle if Brave is in the active chain.
    providers = _active_providers()
    needs_throttle = any(name == "brave" for name, _ in providers)

    for idx, q in enumerate(queries):
        for hit in search(q, max_results=3):
            if hit.get("content"):
                parts.append(f"[{hit.get('title', '')}]\n{hit['content']}")
        if needs_throttle and idx < len(queries) - 1:
            time.sleep(1.1)

    return "\n\n---\n\n".join(parts) if parts else "No external search results available."
