# Is There a Dishwasher?

Paste a Zillow listing URL and instantly find out if the unit has a dishwasher.
**Stage 1** searches the listing text. **Stage 2** uses a vision API to analyse
listing photos when the text check draws a blank.

## Docs

- [Software Requirements & Design (SRS.md)](SRS.md)
- [Architecture (ARCHITECTURE.md)](ARCHITECTURE.md)
- [External API Vision Plan (EXTERNAL_API_VISION_PLAN.md)](EXTERNAL_API_VISION_PLAN.md)
- [Dishwasher Detection Research (DISHWASHER_DETECTION_RESEARCH.md)](DISHWASHER_DETECTION_RESEARCH.md)
- [Listing Platform Research — Zillow vs Apartments.com (LISTING_PLATFORM_RESEARCH.md)](LISTING_PLATFORM_RESEARCH.md)
- [Browser Extension Concept (BROWSER_EXTENSION_CONCEPT.md)](BROWSER_EXTENSION_CONCEPT.md)

---

## Running locally

You need two processes: the Python backend and the Vite dev server.

### 1. Backend (Python / FastAPI)

#### Option A — Docker (recommended on Windows)

Make sure [Docker Desktop](https://www.docker.com/products/docker-desktop/) is
running, then from the project root:

```bash
docker compose up --build
```

The first build takes a few minutes while Docker downloads the Playwright image
and installs dependencies. Subsequent starts are fast.

#### Option B — Shell script (macOS / Linux)

```bash
./backend/start.sh
```

The script creates a virtual environment, installs dependencies, and installs
the Playwright Chromium browser on first run — then starts the server. Just
run the same command every time; it skips setup steps that are already done.

The API runs on **http://localhost:8000**.  
Health check: `curl http://localhost:8000/health`

### 2. Frontend (React / Vite)

In a separate terminal, from the project root:

```bash
npm install
npm run dev
```

Open **http://localhost:5173**, paste a Zillow URL, and click **Check**.

Vite automatically proxies `/api` requests to `http://localhost:8000` so no
CORS configuration is needed during development.

---

## Vision API setup (Stage 2)

Photo analysis requires an API key for a vision model.  Copy
`backend/.env.example` to `backend/.env` and fill in your key:

```bash
cp backend/.env.example backend/.env
# Edit backend/.env and set VISION_API_KEY=sk-...
```

When `VISION_API_KEY` is not set the backend still works — it just falls back
to text-only detection.  See `backend/.env.example` for the full list of
options including Azure OpenAI and self-hosted Ollama.

---

## How it works

1. The frontend sends a `POST /api/check` request with the listing URL.
2. The backend fetches the Zillow page (plain HTTPS first, Playwright fallback).
3. **Stage 1 — text:** the listing description and amenities text are scanned
   for the word **"dishwasher"** (case-insensitive). If found, the result is
   returned immediately.
4. **Stage 2 — vision:** if the text check draws a blank, each listing photo is
   sent to the configured vision API. The first photo confirmed to contain a
   dishwasher ends the search.
5. A `{ has_dishwasher, method, evidence }` response is returned and displayed.

