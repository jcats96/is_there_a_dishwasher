# Is There a Dishwasher?

Paste a Zillow listing URL and instantly find out if the unit has a dishwasher.
**v0.1** searches the listing text. Photo-based vision detection is coming next.

## Docs

- [Software Requirements & Design (SRS.md)](SRS.md)
- [Architecture (ARCHITECTURE.md)](ARCHITECTURE.md)
- [Dishwasher Detection Research (DISHWASHER_DETECTION_RESEARCH.md)](DISHWASHER_DETECTION_RESEARCH.md)
- [Listing Platform Research — Zillow vs Apartments.com (LISTING_PLATFORM_RESEARCH.md)](LISTING_PLATFORM_RESEARCH.md)
- [Browser Extension Concept (BROWSER_EXTENSION_CONCEPT.md)](BROWSER_EXTENSION_CONCEPT.md)

---

## Running locally

You need two processes: the Python backend and the Vite dev server.

### 1. Backend (Python / FastAPI)

```bash
cd backend
python -m venv .venv
source .venv/bin/activate          # Windows: .venv\Scripts\activate
pip install -r requirements.txt
playwright install chromium --with-deps   # only needed once
uvicorn main:app --reload
```

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

## How it works (v0.1)

1. The frontend sends a `POST /api/check` request with the listing URL.
2. The backend fetches the Zillow page (plain HTTPS first, Playwright fallback).
3. The listing description and amenities text are scanned for the word
   **"dishwasher"** (case-insensitive).
4. A `{ has_dishwasher, method, evidence }` response is returned and displayed.

Photo-based detection (Stage 2) is not yet implemented.

