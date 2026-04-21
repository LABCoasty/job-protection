"""Configuration from environment variables."""

import os
from functools import lru_cache


@lru_cache
def get_config():
    return {
        # Search providers (priority: Google CSE > Tavily > Brave > SearXNG)
        "google_cse_api_key": os.getenv("GOOGLE_CSE_API_KEY"),  # Google Custom Search API key
        "google_cse_id": os.getenv("GOOGLE_CSE_ID"),  # Programmable Search Engine ID (cx)
        "tavily_api_key": os.getenv("TAVILY_API_KEY"),
        "brave_api_key": os.getenv("BRAVE_API_KEY"),
        "searxng_url": os.getenv("SEARXNG_URL", "http://localhost:8080"),
        # LLM providers
        "groq_api_key": os.getenv("GROQ_API_KEY"),  # if set, use Groq
        "groq_model": os.getenv("GROQ_MODEL", "llama-3.3-70b-versatile"),
        "ollama_url": os.getenv("OLLAMA_URL", "http://localhost:11434"),
        "ollama_model": os.getenv("OLLAMA_MODEL", "qwen2:7b"),
        # Persistence + cache
        "database_url": os.getenv("DATABASE_URL"),  # optional
        "scan_cache_ttl_seconds": int(os.getenv("SCAN_CACHE_TTL_SECONDS", "3600")),
        # Access control — when set, all endpoints except /health require
        # a matching X-API-Token header. Intended so only the Chrome extension
        # (which injects the token) can talk to the backend.
        "api_token": os.getenv("API_TOKEN"),
    }
