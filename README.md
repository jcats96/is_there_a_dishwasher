# Is There a Dishwasher?

Paste a Zillow listing URL and instantly find out if the unit has a dishwasher.
**Stage 1** searches the listing text. **Stage 2** uses a vision model to
analyse listing photos when the text check draws a blank.

Zillow listing pages are rendered by a **headless Chromium browser**
([Playwright](https://playwright.dev/)) so all dynamically-loaded content
(text, amenities, photos) is fully available before extraction.

## Docs

- [Software Requirements & Design (SRS.md)](docs/SRS.md)
- [Architecture (ARCHITECTURE.md)](docs/ARCHITECTURE.md)
- [Dishwasher Detection Research (DISHWASHER_DETECTION_RESEARCH.md)](docs/DISHWASHER_DETECTION_RESEARCH.md)
- [Listing Platform Research — Zillow vs Apartments.com (LISTING_PLATFORM_RESEARCH.md)](docs/LISTING_PLATFORM_RESEARCH.md)
- [Browser Extension Concept (BROWSER_EXTENSION_CONCEPT.md)](docs/BROWSER_EXTENSION_CONCEPT.md)

---

## Running locally (development)

```bash
npm install                      # install all dependencies (run once)
npx playwright install chromium  # download Chromium for Playwright (run once)
npm run dev                      # start the Vite dev server on http://localhost:5173
```

Open **http://localhost:5173**, paste a Zillow URL, and click **Check**.

The Vite dev server includes a built-in `/api/scrape` endpoint powered by
Playwright — no separate server process is needed during development.

---

## Running in production

```bash
npm install
npx playwright install chromium
npm run build   # build the React frontend into dist/
npm start       # start the Express + Playwright server on http://localhost:3000
```

The production server (`server/index.js`) serves the static frontend from
`dist/` and exposes the same `/api/scrape` endpoint.  Set the `PORT`
environment variable to use a different port.

---

## Hugging Face API token (required for photo analysis)

Stage 2 vision detection calls the
[Hugging Face Inference API](https://huggingface.co/inference-api) (via
[router.huggingface.co](https://router.huggingface.co)) server-side.
You need a free Hugging Face account and an API token.

**Option A — enter it in the app UI**

Click **▼ Hugging Face API token** below the search bar, paste your token
(`hf_…`), and the app saves it in your browser's `localStorage`.

**Option B — bake it in at build time**

Copy `.env.example` to `.env.local` and set the token:

```bash
cp .env.example .env.local
# Edit .env.local and set VITE_HF_TOKEN=hf_...
```

The token is then embedded in the built bundle and used as the default (the
in-app input always takes precedence).

Get a free token at **https://huggingface.co/settings/tokens**.

---

## How it works

1. **Render** — A headless Chromium browser (Playwright) opens the Zillow
   listing page and waits for all JavaScript to finish executing so that
   dynamically-loaded text, amenities, and photo URLs are fully present.
2. **Search text** — The extracted text is scanned for the word
   **"dishwasher"** (case-insensitive). If found, the result is returned
   immediately.
3. **Analyse photos** — If the text check draws a blank, up to 10 listing
   photos are sent one-by-one to
   [openbmb/MiniCPM-V-2](https://huggingface.co/openbmb/MiniCPM-V-2) via the
   Hugging Face Inference API (`router.huggingface.co`) with the question:
   *"Does this photo show a dishwasher?"*
4. **Report** — You get a clear **Yes** or **No**, the matching text snippet
   or photo, and which method found the answer.

---

## Running tests

```bash
npm test   # run the Vitest unit-test suite
```

Unit tests live in `tests/` and cover the server-side Hugging Face vision
proxy (`server/vision.js`).  No real API calls are made — `fetch` is stubbed
so the suite runs offline.

