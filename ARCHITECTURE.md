# Architecture — Is There a Dishwasher?

## 1. Overview

The system is composed of three layers:

```
┌────────────────────────────────┐
│         React Frontend         │  Vite + React  (browser)
└────────────┬───────────────────┘
             │  HTTPS / REST
┌────────────▼───────────────────┐
│         FastAPI Backend        │  Python  (server)
│  ┌──────────┐  ┌────────────┐  │
│  │ Scraper  │  │ Classifier │  │
│  └──────────┘  └────────────┘  │
└────────────────────────────────┘
             │  HTTPS
┌────────────▼───────────────────┐
│     External Vision API        │  OpenAI GPT-4o  (third party)
└────────────────────────────────┘
```

---

## 2. Frontend

**Technology:** React 19, Vite 8, plain CSS

| Component | Responsibility |
|-----------|---------------|
| `App.jsx` | Landing page — explains the concept |
| `SearchForm` *(future)* | URL input, loading state, result display |

The frontend communicates with the backend over a single REST endpoint.
No listing URLs, photos, or API keys are handled client-side.

---

## 3. Backend

**Technology:** Python 3.12, FastAPI

### 3.1 Scraper Module

- Accepts a listing URL.
- Uses **Playwright** (headless Chromium) to handle JavaScript-rendered pages.
- Extracts the full listing text (description + amenities list) and `<img>`
  sources from the photo gallery section.
- Returns `{ text: str, image_urls: list[str] }`.

### 3.2 Classifier Module

Detection runs in two stages and short-circuits as soon as a positive result
is found:

**Stage 1 — Text check (fast, free)**
- Searches the scraped listing text for the word `dishwasher`
  (case-insensitive).
- If found, returns `{ has_dishwasher: true, method: "text", evidence: "…dishwasher…" }`
  immediately — no images are fetched or analyzed.

**Stage 2 — Vision check (fallback, only if Stage 1 is negative)**
- Iterates over the scraped image URLs.
- For each image, sends a prompt to the **OpenAI Vision API** (GPT-4o):
  > "Does this kitchen photo show a dishwasher? Answer yes or no."
- Returns `{ has_dishwasher: true, method: "image", evidence: <url> }` on the
  first "yes", or `{ has_dishwasher: false, method: "image", evidence: null }`
  after exhausting all images.

### 3.3 REST API

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/check` | Accepts `{ "url": "…" }`, returns `{ "has_dishwasher": bool, "method": "text" \| "image", "evidence": string \| null }` |

---

## 4. Data Flow

```
User pastes URL
      │
      ▼
POST /api/check
      │
      ▼
Scraper fetches listing page
      │
      ▼
Extract text + image URLs
      │
      ▼
Search text for "dishwasher"
      │
      ├── found  → return { has_dishwasher: true,  method: "text",  evidence: snippet }
      │
      └── not found
            │
            ▼
      For each image → Vision API
            │
            ├── "yes" found → return { has_dishwasher: true,  method: "image", evidence: url }
            │
            └── exhausted  → return { has_dishwasher: false, method: "image", evidence: null }
```

---

## 5. Deployment (suggested)

| Component | Hosting |
|-----------|---------|
| Frontend | GitHub Pages / Vercel (static build) |
| Backend | Fly.io / Railway / Docker container |
| Secrets | Environment variables; never in source code |

---

## 6. Key Design Decisions

| Decision | Rationale |
|----------|-----------|
| Headless browser for scraping | Modern listing sites render photos via JavaScript; simple HTTP fetch would miss most images. |
| Text-first detection | Checking the listing description for the word "dishwasher" is instant and free. Image analysis is only invoked when the text check is negative, minimising latency and API cost. |
| Stateless backend | No database needed; each request is self-contained. The API key and scraped images stay in server memory only for the duration of the request. |
| Swappable classifier interface | The Classifier module accepts any callable that takes an image URL and returns a boolean, so the underlying model can be swapped without changing the API layer. |

---

## 7. Security Considerations

- Vision API key is stored as a server-side environment variable only.
- The backend validates that submitted URLs are HTTP/HTTPS before fetching.
- Response images are served as URLs (not proxied), so no binary blobs pass
  through the backend.
- Rate limiting on the `/api/check` endpoint prevents abuse.
