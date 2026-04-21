# JobGuard

JobGuard is a Chrome extension powered by a FastAPI backend that detects fraudulent or ghost job listings and provides transparent risk scoring. It works two ways:

- **Local dev** — Docker runs SearXNG + Ollama for search/AI
- **Hosted (free tier)** — Groq (LLM) + Google Custom Search (or Brave) + Render (backend) + Vercel (frontend) + Neon (Postgres)

**Stack:** Chrome Extension (Manifest v3) → FastAPI → (Groq **or** Ollama) + (Google CSE **or** Brave **or** SearXNG) → Optional PostgreSQL

---

## Option A: Local dev (Docker)

### 1. Backend

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate   # or .venv\Scripts\activate on Windows
pip install -r requirements.txt
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

### 2. Frontend

```bash
cd frontend
pnpm install
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000). Set `NEXT_PUBLIC_API_URL=http://localhost:8000` in `.env.local`.

### 3. Chrome extension

1. Open `chrome://extensions/`
2. Enable **Developer mode**
3. Click **Load unpacked** and select the `extension` folder
4. Use the extension on a LinkedIn or Indeed job page: open the side panel and **Scan this listing**.

### 4. SearXNG + Ollama (Docker)

```bash
docker compose up -d searxng ollama
docker exec -it jobguard-ollama ollama pull qwen2:7b
```

Backend env (optional — defaults shown):

- `SEARXNG_URL=http://localhost:8080`
- `OLLAMA_URL=http://localhost:11434`
- `OLLAMA_MODEL=qwen2:7b`

Without these, the backend still runs and returns a **mock** scan (no real search or AI).

### 5. PostgreSQL (optional, for history)

```bash
docker compose --profile db up -d postgres
```

Backend env:

- `DATABASE_URL=postgresql://truepost:truepost@localhost:5432/truepost`

---

## Option B: Hosted (free tier, for public extension use)

Chrome extensions can't call `localhost`, so to use the extension outside your laptop you need public URLs. The backend supports hosted providers that slot in via env vars — no code changes.

### 1. Get API keys (all free tiers)

| Service | Sign up | Free tier |
|---|---|---|
| **Groq** (LLM) | [console.groq.com](https://console.groq.com) | ~30 req/min, Llama 3.3 70B |
| **Google Custom Search** *(recommended — reuses your Google Cloud project)* | See setup below | 100 queries/day |
| **Brave Search** *(alt to Google)* | [brave.com/search/api](https://brave.com/search/api) | 2,000 queries/month, 1 req/sec |
| **Neon Postgres** *(optional)* | [neon.tech](https://neon.tech) | 0.5 GB storage |

**Google Custom Search setup** (one-time):

1. In your existing Google Cloud project (e.g. `jobguard-research`), enable the **Custom Search API** at [console.cloud.google.com/apis/library/customsearch.googleapis.com](https://console.cloud.google.com/apis/library/customsearch.googleapis.com)
2. Create an **API key** at [console.cloud.google.com/apis/credentials](https://console.cloud.google.com/apis/credentials) → Create Credentials → API key. Restrict it to Custom Search API. This is `GOOGLE_CSE_API_KEY`.
3. Create a **Programmable Search Engine** at [programmablesearchengine.google.com](https://programmablesearchengine.google.com) → Create. Turn on **Search the entire web**. Copy the **Search engine ID** (the `cx` value). This is `GOOGLE_CSE_ID`.

Free tier is 100 queries/day. JobGuard runs ~3 searches per scan, so that's ~33 scans/day — plenty for a research demo.

### 2. Deploy backend → Render

1. Push this repo to GitHub.
2. In Render, **New + → Blueprint** and select this repo. It'll read `render.yaml` at the root.
3. In the service's **Environment** tab, set:
   - `GROQ_API_KEY` — from Groq
   - `GOOGLE_CSE_API_KEY` + `GOOGLE_CSE_ID` — from Google (or skip and use Brave instead)
   - `BRAVE_API_KEY` — from Brave (only if not using Google CSE)
   - `DATABASE_URL` — from Neon (optional; skip for no history persistence)
4. Wait for the build. Your backend URL will be `https://jobguard-backend.onrender.com` (or similar).

Free-tier note: Render sleeps after 15 min idle; first scan after sleep takes ~30s to wake the container.

### 3. Deploy frontend → Vercel

1. In Vercel, **Add New → Project** and import this repo.
2. Set **Root Directory** to `frontend`.
3. Set env var `NEXT_PUBLIC_API_URL` to your Render backend URL from step 2.
4. Deploy. Your frontend URL will be `https://jobguard-<hash>.vercel.app`.

### 4. Point the extension at hosted URLs

1. Load the extension (unpacked).
2. Open **Options** (gear icon or `chrome://extensions` → Details → Extension options).
3. Set **Backend URL** to your Render URL.
4. Set **Frontend URL** to your Vercel URL.

That's it — scans now use Groq for AI and Brave for search.

---

## Provider selection (how the backend chooses)

**LLM:**

| Env var present | Provider used |
|---|---|
| `GROQ_API_KEY` | Groq hosted LLM |
| *(unset)* | Local Ollama at `OLLAMA_URL` |

**Search** (checked in order; first match wins):

| Env var(s) present | Provider used |
|---|---|
| `GOOGLE_CSE_API_KEY` + `GOOGLE_CSE_ID` | Google Custom Search |
| `BRAVE_API_KEY` | Brave Search API |
| *(none of the above)* | Local SearXNG at `SEARXNG_URL` |

If neither LLM nor search is reachable, the backend returns a mock result so the UI still works end-to-end.

---

## Project layout

| Path | Description |
|------|-------------|
| `backend/` | FastAPI app: `POST /scan`, `GET /scan/{id}`, `GET /history`, `GET /health` |
| `frontend/` | Next.js app: home, scanning, results, history, export, about |
| `extension/` | Chrome extension: content scripts (LinkedIn/Indeed), side panel, options |
| `docker-compose.yml` | Local SearXNG, Ollama, optional Postgres |
| `render.yaml` | Render blueprint for backend deploy |

---

## Environment reference

**Backend:**

- `GROQ_API_KEY` — enables Groq (hosted LLM); else falls back to Ollama
- `GROQ_MODEL` — Groq model id (default `llama-3.3-70b-versatile`)
- `GOOGLE_CSE_API_KEY` + `GOOGLE_CSE_ID` — enables Google Custom Search (highest search priority)
- `BRAVE_API_KEY` — enables Brave Search (used if Google CSE not set)
- `OLLAMA_URL` / `OLLAMA_MODEL` — local Ollama (default `http://localhost:11434`, `qwen2:7b`)
- `SEARXNG_URL` — local SearXNG (default `http://localhost:8080`)
- `DATABASE_URL` — PostgreSQL connection string (optional; no history if unset)
- `SCAN_CACHE_TTL_SECONDS` — in-memory cache TTL (default `3600`)

**Frontend:**

- `NEXT_PUBLIC_API_URL` — backend base URL (default `http://localhost:8000`)

**Extension:** both `backendUrl` and `frontendUrl` are set via the options page (stored in `chrome.storage.sync`).

---

## One-sentence summary

JobGuard is a Chrome extension that verifies job listings before you apply, using open-source search + AI to surface fraud and ghost-job signals with transparent scoring.
