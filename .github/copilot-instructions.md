# Copilot Instructions — Is There a Dishwasher?

## What This Repository Does

A web app that accepts a Zillow listing URL and reports whether the unit has a dishwasher. The current implementation (v0.1) scans the listing's text and amenities list for the word "dishwasher". A future Stage 2 will use a vision model to inspect listing photos.

---

## Repository Layout

```
/
├── .github/
│   └── copilot-instructions.md   ← this file
├── backend/
│   ├── main.py          # FastAPI application — defines /health and /api/check endpoints
│   ├── checker.py       # Text-search logic: scans listing text for "dishwasher"
│   ├── scraper.py       # Fetches a Zillow page (httpx first, Playwright fallback)
│   ├── requirements.txt # Python dependencies
│   └── start.sh         # One-shot setup + uvicorn server launcher
├── docs/                # Architecture, SRS, and research Markdown files
├── public/              # Static assets served by Vite
├── src/
│   ├── main.jsx         # React entry point
│   ├── App.jsx          # Single-page UI: form, loading state, result display
│   ├── App.css          # Component styles
│   └── index.css        # Global styles
├── eslint.config.js     # ESLint flat config (React + React Hooks + React Refresh)
├── package.json         # npm scripts: dev, build, lint, preview
├── vite.config.js       # Vite config; proxies /api → http://localhost:8000
└── index.html           # HTML shell for Vite
```

**No test suite exists yet.** There are no `*.test.*` files or testing framework dependencies.

---

## Tech Stack

| Layer    | Technology                                        |
|----------|---------------------------------------------------|
| Frontend | React 19, Vite 8, plain CSS (no CSS framework)   |
| Backend  | Python 3.12, FastAPI, Pydantic, uvicorn           |
| Scraping | httpx (plain HTTPS), Playwright/Chromium (fallback) |
| Parsing  | BeautifulSoup 4                                   |
| Linting  | ESLint 9 (flat config)                            |

---

## Running Locally

Two processes must run simultaneously.

### Backend (Python / FastAPI)

```bash
./backend/start.sh
```

`start.sh` (idempotent — safe to run repeatedly):
1. Creates `backend/.venv` if it does not exist.
2. Installs Python dependencies from `backend/requirements.txt`.
3. Installs Playwright's Chromium browser if not already present.
4. Starts uvicorn with `--reload` on **http://localhost:8000**.

Health check: `curl http://localhost:8000/health`

### Frontend (React / Vite)

```bash
npm install        # install Node dependencies (run once, or after package changes)
npm run dev        # start Vite dev server on http://localhost:5173
```

Vite automatically proxies `/api/*` requests to `http://localhost:8000` (configured in `vite.config.js`). No CORS setup is needed during development.

---

## Common Commands

| Purpose              | Command                     |
|----------------------|-----------------------------|
| Start backend        | `./backend/start.sh`        |
| Start frontend       | `npm run dev`               |
| Production build     | `npm run build`             |
| Lint frontend        | `npm run lint`              |
| Preview prod build   | `npm run preview`           |

Always run `npm install` before building or linting if `node_modules` is absent.

---

## Key Architectural Details

- **`/api/check` endpoint** (`backend/main.py`): accepts `{ "url": "…" }` (must be an HTTPS Zillow URL), returns `{ "has_dishwasher": bool, "method": "text", "evidence": string | null }`.
- **URL validation** (`backend/scraper.py → _validate_url`): only `zillow.com` / `www.zillow.com` hosts are allowed; the URL is reconstructed from parsed components before use.
- **Scraper fallback** (`backend/scraper.py`): plain httpx is tried first; Playwright is only started when httpx returns a short/bot-challenge response.
- **Text extraction** (`backend/scraper.py → _extract_text_from_html`): prefers Zillow's `__NEXT_DATA__` JSON blob (embedded in a `<script>` tag) because Zillow's CSS class names are hashed and change frequently.
- **Frontend proxy**: `vite.config.js` proxies `/api` to `localhost:8000`; no CORS middleware changes are needed for local development.
- **CORS** (`backend/main.py`): currently set to `allow_origins=["*"]`; tighten this before deploying to production.
- **No database**: each request is fully stateless.
- **No environment variables are required** for v0.1 (text-only). A future `OPENAI_API_KEY` will be needed for Stage 2 vision detection.
