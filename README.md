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

## How it works (v0.1)

1. The frontend sends a `POST /api/check` request with the listing URL.
2. The backend fetches the Zillow page (plain HTTPS first, Playwright fallback).
3. The listing description and amenities text are scanned for the word
   **"dishwasher"** (case-insensitive).
4. A `{ has_dishwasher, method, evidence }` response is returned and displayed.

Photo-based detection (Stage 2) is not yet implemented.

---

## Training the dishwasher detector

The image classifier is a **MobileNetV3-Small** binary classifier fine-tuned on
Google Open Images v7 and exported as an ONNX file that the backend loads at
runtime. Training runs entirely on your local machine — no GPU required (though
it is significantly faster with one).

### Prerequisites

- Python 3.10+
- ~10 GB of free disk space (for the training images)
- ~20 min on a GPU, or ~4 hours on CPU

### Step 1 — Install training dependencies

```bash
pip install -r requirements_train.txt
```

### Step 2 — Download the dataset

```bash
python download_dataset.py
```

This downloads ~4 000 dishwasher images and ~4 000 kitchen images from Google
Open Images v7, then splits them into `data/train/`, `data/val/`, and
`data/test/` directories.  The `data/` folder is git-ignored — it lives only on
your machine.

### Step 3 — Train

```bash
python train.py
```

Common options:

| Flag | Default | Description |
|------|---------|-------------|
| `--epochs` | 20 | Max training epochs |
| `--batch-size` | 32 | Mini-batch size |
| `--lr` | 1e-4 | AdamW learning rate |
| `--patience` | 5 | Early-stopping patience |
| `--device` | auto | `cuda` / `mps` / `cpu` |
| `--data-dir` | `data` | Root of the dataset |
| `--output` | `backend/models/dishwasher_classifier.onnx` | Output path |

Training prints per-epoch loss and accuracy on both splits, restores the best
checkpoint, evaluates on the held-out test set, and writes the ONNX file.

### Step 4 — Commit the model weights

The trained ONNX file (`backend/models/dishwasher_classifier.onnx`, ~9 MB) is
committed to the repository so that the backend can load it without any
external download at startup.

This repository uses **[Git LFS](https://git-lfs.com/)** to store binary model
files efficiently.  If you haven't set it up yet, run this once:

```bash
git lfs install
```

Then commit as normal:

```bash
git add backend/models/dishwasher_classifier.onnx
git commit -m "Add trained dishwasher classifier"
git push
```

> **Note:** If Git LFS is not available, the file can still be committed
> directly — at ~9 MB it is well within GitHub's 100 MB per-file limit.

