# Is There a Dishwasher?

Paste a Zillow listing URL and instantly find out if the unit has a dishwasher.
**Stage 1** searches the listing text. **Stage 2** uses a vision model to
analyse listing photos when the text check draws a blank.

Everything runs directly in your browser — there is no backend server.

## Docs

- [Software Requirements & Design (SRS.md)](docs/SRS.md)
- [Architecture (ARCHITECTURE.md)](docs/ARCHITECTURE.md)
- [Dishwasher Detection Research (DISHWASHER_DETECTION_RESEARCH.md)](docs/DISHWASHER_DETECTION_RESEARCH.md)
- [Listing Platform Research — Zillow vs Apartments.com (LISTING_PLATFORM_RESEARCH.md)](docs/LISTING_PLATFORM_RESEARCH.md)
- [Browser Extension Concept (BROWSER_EXTENSION_CONCEPT.md)](docs/BROWSER_EXTENSION_CONCEPT.md)

---

## Running locally

```bash
npm install
npm run dev
```

Open **http://localhost:5173**, paste a Zillow URL, and click **Check**.

That's it — no backend, no Docker, no Python required.

---

## Hugging Face API token (required for photo analysis)

Stage 2 vision detection calls the
[Hugging Face Inference API](https://huggingface.co/inference-api) directly
from your browser. You need a free Hugging Face account and an API token.

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

Everything runs client-side — no requests are sent to any server you control.

1. **Fetch** — The Zillow listing page is fetched via the
   [allorigins.win](https://allorigins.win/) CORS proxy. The HTML (including
   Zillow's embedded `__NEXT_DATA__` JSON blob) is parsed in your browser to
   extract all listing text and photo URLs.
2. **Search text** — The extracted text is scanned for the word
   **"dishwasher"** (case-insensitive). If found, the result is returned
   immediately.
3. **Analyse photos** — If the text check draws a blank, up to 10 listing
   photos are sent one-by-one to
   [openbmb/MiniCPM-V-2](https://huggingface.co/openbmb/MiniCPM-V-2) via the
   Hugging Face Inference API with the question: *"Does this photo show a
   dishwasher?"*
4. **Report** — You get a clear **Yes** or **No**, the matching text snippet
   or photo, and which method found the answer.

