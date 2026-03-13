"""
main.py — FastAPI application for Is There a Dishwasher?

Stage 1 (text): scans the listing description and amenities for "dishwasher".
Stage 2 (vision): if Stage 1 draws a blank, asks a vision API to inspect each
listing photo.  Stage 2 requires the VISION_API_KEY environment variable to
be set (see .env.example).
"""

from __future__ import annotations

import asyncio
import logging
import os

from dotenv import load_dotenv

load_dotenv()  # loads backend/.env if present; no-op if the file is absent

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, HttpUrl

from checker import check_text
from scraper import scrape_listing
from vision_client import has_dishwasher_in_image, is_vision_enabled

logger = logging.getLogger(__name__)

app = FastAPI(title="Is There a Dishwasher?", version="0.2.0")

# Allow the Vite dev server (any localhost port) to call the API.
# In production, replace "*" with your deployed frontend origin.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["POST", "GET"],
    allow_headers=["*"],
)


class CheckRequest(BaseModel):
    url: HttpUrl


class CheckResponse(BaseModel):
    has_dishwasher: bool
    method: str
    evidence: str | None


@app.on_event("startup")
async def _startup_log() -> None:
    if is_vision_enabled():
        model = os.getenv("VISION_MODEL", "gpt-4o-mini")
        endpoint = os.getenv(
            "VISION_API_ENDPOINT", "https://api.openai.com/v1/chat/completions"
        )
        logger.info("Vision Stage 2 enabled: model=%s endpoint=%s", model, endpoint)
    else:
        logger.warning(
            "VISION_API_KEY is not set — Stage 2 vision detection is disabled. "
            "Set VISION_API_KEY (and optionally VISION_API_ENDPOINT / VISION_MODEL) "
            "to enable photo analysis."
        )


@app.get("/health")
def health() -> dict:
    return {"status": "ok", "vision_enabled": is_vision_enabled()}


@app.post("/api/check", response_model=CheckResponse)
async def check(req: CheckRequest) -> CheckResponse:
    """
    Accept a listing URL, scrape the page, and detect whether there is a
    dishwasher.

    Stage 1 — text search (fast, free, always runs).
    Stage 2 — vision API (runs only when Stage 1 draws a blank and
               VISION_API_KEY is configured).
    """
    url_str = str(req.url)
    try:
        listing = await asyncio.to_thread(scrape_listing, url_str)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except RuntimeError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(
            status_code=500, detail=f"Unexpected scraper error: {exc}"
        ) from exc

    # Stage 1 — text
    result = check_text(listing.text)
    if result["has_dishwasher"]:
        return CheckResponse(**result)

    # Stage 2 — vision (external API), only if configured
    if is_vision_enabled() and listing.image_urls:
        max_images = int(os.getenv("VISION_MAX_IMAGES", "10"))
        for img_url in listing.image_urls[:max_images]:
            found, reason = await has_dishwasher_in_image(img_url)
            if found:
                return CheckResponse(
                    has_dishwasher=True,
                    method="vision",
                    evidence=img_url,
                )
        return CheckResponse(has_dishwasher=False, method="vision", evidence=None)

    return CheckResponse(**result)
