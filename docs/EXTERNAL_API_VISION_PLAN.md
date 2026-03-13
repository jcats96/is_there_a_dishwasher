# External API Vision Backend — Alternate Plan

## 1. Overview

This document describes an alternate implementation of Stage 2 (image-based
dishwasher detection) in which the backend **delegates vision inference to a
remote API service** rather than running a model locally.  The backend sends
each listing photo and a natural-language question to a configurable HTTP
endpoint and interprets the response.

> **Trade-off acknowledged:** This approach requires the operator (or user) to
> hold an API key for a third-party AI service.  It is harder for non-technical
> users to self-host, but it eliminates all local GPU/CPU model requirements,
> produces higher accuracy out of the box, and is faster to implement.

---

## 2. Motivation

The local-model plan (`DISHWASHER_DETECTION_RESEARCH.md §8`) works without any
external dependency, but it carries significant up-front cost:

| Concern | Local ONNX model | External API |
|---------|-----------------|--------------|
| Setup time | Dataset collection + training (~days) | Obtain API key (~minutes) |
| Inference hardware | CPU required (GPU preferred for training) | None — handled by provider |
| Model accuracy | Depends on dataset quality and size | State-of-the-art out of the box |
| Maintenance | Re-train when accuracy degrades | Provider updates the model |
| Per-request cost | Free after training | ~$0.002–$0.01 per image |
| Data privacy | All data stays on server | Images sent to third party |

For a project at this stage the external-API path provides the fastest route
to a working, high-accuracy Stage 2 without dataset or training work.

---

## 3. Supported Services

The backend is designed around a **generic vision-question-answering interface**
so any service that accepts an image URL (or base-64 blob) and a text prompt
can be plugged in by changing two environment variables.

| Service | Model | Endpoint | Notes |
|---------|-------|----------|-------|
| **OpenAI** | `gpt-4o`, `gpt-4o-mini` | `https://api.openai.com/v1/chat/completions` | Current default; best general accuracy |
| **Anthropic** | `claude-3-5-sonnet-20241022` | `https://api.anthropic.com/v1/messages` | Comparable vision quality; different request schema |
| **Google** | `gemini-1.5-flash` | `https://generativelanguage.googleapis.com/v1beta/models/…:generateContent` | Faster and cheaper; slightly lower accuracy |
| **Azure OpenAI** | `gpt-4o` (deployment name) | `https://<resource>.openai.azure.com/openai/deployments/<deployment>/chat/completions` | Enterprise / compliance scenarios |
| **Self-hosted Ollama** | `llava`, `bakllava` | `http://localhost:11434/api/chat` | Privacy-first; requires a GPU server |

The backend ships with an **OpenAI-compatible adapter** by default (covers
OpenAI, Azure OpenAI, and any provider that mirrors the OpenAI chat
completions schema).  Anthropic and Google adapters are thin wrappers that
translate the same internal request into the provider's wire format.

---

## 4. Configuration

All connection details live in **environment variables** — no secrets appear in
source code.

| Variable | Required | Description |
|----------|----------|-------------|
| `VISION_API_KEY` | Yes | Bearer token / API key for the chosen service |
| `VISION_API_ENDPOINT` | No | Full URL of the chat-completions endpoint (defaults to OpenAI) |
| `VISION_MODEL` | No | Model identifier (defaults to `gpt-4o-mini`) |
| `VISION_MAX_IMAGES` | No | Maximum images to analyse per request (default: `10`) |
| `VISION_TIMEOUT_SECONDS` | No | Per-call timeout in seconds (default: `30`) |

### 4.1 Example `.env` file

```dotenv
# OpenAI (default)
VISION_API_KEY=sk-...
VISION_API_ENDPOINT=https://api.openai.com/v1/chat/completions
VISION_MODEL=gpt-4o-mini

# --- OR ---

# Azure OpenAI
VISION_API_KEY=<azure-key>
VISION_API_ENDPOINT=https://my-resource.openai.azure.com/openai/deployments/gpt-4o/chat/completions?api-version=2024-02-01
VISION_MODEL=gpt-4o

# --- OR ---

# Self-hosted Ollama (no key needed)
VISION_API_KEY=
VISION_API_ENDPOINT=http://localhost:11434/v1/chat/completions
VISION_MODEL=llava
```

The backend validates at startup that `VISION_API_KEY` is set (unless the
endpoint is `localhost`, where an empty key is acceptable).

---

## 5. Backend Design

### 5.1 Module: `backend/vision_client.py`

```
backend/
├── main.py            # FastAPI app (unchanged public API)
├── checker.py         # Stage 1 text check (unchanged)
├── scraper.py         # Zillow scraper (unchanged)
└── vision_client.py   # NEW — external API adapter (Stage 2)
```

`vision_client.py` exposes a single async function:

```python
async def has_dishwasher_in_image(image_url: str) -> tuple[bool, str | None]:
    """
    Ask the configured vision API whether an image shows a dishwasher.

    Returns:
        (True, reason_string)  — dishwasher detected
        (False, None)          — not detected or inconclusive
    """
```

### 5.2 Request Format (OpenAI-compatible)

```python
import os
import httpx

_ENDPOINT = os.getenv(
    "VISION_API_ENDPOINT",
    "https://api.openai.com/v1/chat/completions",
)
_MODEL    = os.getenv("VISION_MODEL", "gpt-4o-mini")
_API_KEY  = os.getenv("VISION_API_KEY", "")
_TIMEOUT  = int(os.getenv("VISION_TIMEOUT_SECONDS", "30"))

_PROMPT = (
    "Does this kitchen photo show a dishwasher? "
    "Answer with exactly one word: yes or no. "
    "If the image is not a kitchen photo, answer no."
)

async def has_dishwasher_in_image(
    image_url: str,
) -> tuple[bool, str | None]:
    payload = {
        "model": _MODEL,
        "messages": [
            {
                "role": "user",
                "content": [
                    {
                        "type": "image_url",
                        "image_url": {"url": image_url, "detail": "low"},
                    },
                    {"type": "text", "text": _PROMPT},
                ],
            }
        ],
        "max_tokens": 5,
    }
    headers = {
        "Authorization": f"Bearer {_API_KEY}",
        "Content-Type": "application/json",
    }

    async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
        response = await client.post(_ENDPOINT, json=payload, headers=headers)
        response.raise_for_status()

    answer = (
        response.json()["choices"][0]["message"]["content"]
        .strip()
        .lower()
    )
    return answer.startswith("yes"), (answer if answer.startswith("yes") else None)
```

### 5.3 Integration into `main.py`

The `/api/check` endpoint already performs a text check (Stage 1) and returns
early on a positive match.  Stage 2 slots in as a second pass when the text
check is negative:

```python
# main.py (Stage 2 addition)
from vision_client import has_dishwasher_in_image

@app.post("/api/check")
async def check(body: CheckRequest):
    listing = await scraper.fetch(body.url)

    # Stage 1 — text
    result = checker.check_text(listing.text)
    if result.has_dishwasher:
        return result

    # Stage 2 — vision (external API)
    max_images = int(os.getenv("VISION_MAX_IMAGES", "10"))
    for url in listing.image_urls[:max_images]:
        found, reason = await has_dishwasher_in_image(url)
        if found:
            return CheckResult(
                has_dishwasher=True,
                method="image",
                evidence=url,
            )

    return CheckResult(has_dishwasher=False, method="image", evidence=None)
```

---

## 6. Error Handling

| Failure mode | Behaviour |
|--------------|-----------|
| `VISION_API_KEY` not set | Backend refuses to start (raises `RuntimeError` during import) |
| API call returns 4xx (bad key, quota exceeded) | Log the error; skip remaining images; return `has_dishwasher: false` with `evidence: "vision_api_error"` so the frontend can surface a warning |
| API call returns 5xx or network timeout | Retry once with exponential back-off; if still failing, treat as negative result |
| Non-JSON or malformed response | Log and treat as negative — do not crash the request |
| Image URL not publicly accessible | The API provider will return an error; handled by the 4xx path above |

---

## 7. Prompt Engineering Notes

The prompt is intentionally minimal to keep `max_tokens` low (reducing cost and
latency) and to avoid parsing free-form prose:

```
"Does this kitchen photo show a dishwasher?
Answer with exactly one word: yes or no.
If the image is not a kitchen photo, answer no."
```

The last sentence reduces false positives from bathroom or laundry room photos.

**Optional extended prompt** for higher accuracy at the cost of a larger
response (increase `max_tokens` to ~40):

```
"You are inspecting a real-estate listing photo.
Does the image show a dishwasher (built-in, portable, or partially visible)?
Start your answer with 'yes' or 'no', then give a single short reason."
```

With the extended prompt, the `has_dishwasher` check becomes
`answer.startswith("yes")` and the reason string is passed back as `evidence`.

---

## 8. Cost Estimate

Using **GPT-4o-mini** with `"detail": "low"` (85 input tokens per image):

| Scenario | Images analysed | Approx. cost |
|----------|----------------|-------------|
| Text match (Stage 1 hit) | 0 | $0.00 |
| 5 images, no dishwasher found | 5 | ~$0.001 |
| 10 images, no dishwasher found | 10 | ~$0.002 |
| 10 images, dishwasher in image 3 | 3 | < $0.001 |

At typical usage volumes (hundreds of checks per month, not millions) cost is
negligible.  If the service scales, the `VISION_MAX_IMAGES` cap prevents
runaway spend on listings with large photo galleries.

---

## 9. Deployment Checklist

- [ ] Set `VISION_API_KEY` as a secret environment variable (never commit it).
- [ ] Set `VISION_API_ENDPOINT` and `VISION_MODEL` for non-OpenAI providers.
- [ ] Confirm the hosting platform allows outbound HTTPS to the API endpoint.
- [ ] Add `VISION_API_KEY` to the backend's `.env.example` with a placeholder
      value so new contributors know the variable is required.
- [ ] Document the key requirement prominently in `README.md` so users are not
      surprised when Stage 2 does not work without a key.

---

## 10. Comparison with the Local Model Plan

| Dimension | Local ONNX model (`DISHWASHER_DETECTION_RESEARCH.md §8`) | External API (this document) |
|-----------|----------------------------------------------------------|------------------------------|
| Setup difficulty | High (dataset, training, ONNX export) | Low (get a key, set env var) |
| Accuracy | Good after sufficient training data | Excellent out of the box |
| Inference latency | 15–30 ms / image | 1–3 s / image |
| Per-request cost | Free | ~$0.001–$0.01 |
| Data privacy | All data on-premises | Images leave the server |
| Offline capability | Yes | No |
| Model updates | Manual retrain | Automatic (provider manages) |
| Barrier to self-hosting | Low (no key needed) | Medium (API key required) |

**Recommendation:** Use the external API approach for the initial Stage 2
implementation.  It delivers production-quality accuracy with minimal
engineering effort.  If privacy requirements tighten or per-image costs
become material at scale, migrate to the local ONNX model as a drop-in
replacement behind the same `has_dishwasher_in_image` interface.

---

## 11. Future Extensions

- **Provider failover:** If the primary endpoint returns a 5xx, automatically
  retry against a secondary endpoint (e.g., fall back from OpenAI to Google
  Gemini) for high-availability deployments.
- **Response caching:** Cache `(image_url_hash → bool)` results in Redis for a
  short TTL to avoid re-analysing the same photo across repeat requests for
  the same listing.
- **Confidence thresholding:** Extend the prompt to request a 0–10 confidence
  score; only trust "yes" answers above a threshold to reduce false positives
  on ambiguous photos.
- **Batch API calls:** OpenAI's Batch API offers a 50 % cost reduction for
  non-real-time workloads; useful if a background job mode is added later.
