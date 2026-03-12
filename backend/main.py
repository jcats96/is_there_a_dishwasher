"""
main.py — FastAPI application for Is There a Dishwasher? (v0.1).

v0.1 only checks listing *text* for the word "dishwasher".
Vision-based detection is planned for a future release.
"""

from __future__ import annotations

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, HttpUrl

from checker import check_text
from scraper import scrape_listing_text

app = FastAPI(title="Is There a Dishwasher?", version="0.1.0")

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


@app.get("/health")
def health() -> dict:
    return {"status": "ok"}


@app.post("/api/check", response_model=CheckResponse)
def check(req: CheckRequest) -> CheckResponse:
    """
    Accept a listing URL, scrape the page text, and search for "dishwasher".

    v0.1 is text-only.  Vision analysis will be added in a later version.
    """
    url_str = str(req.url)
    try:
        text = scrape_listing_text(url_str)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except RuntimeError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(
            status_code=500, detail=f"Unexpected scraper error: {exc}"
        ) from exc

    result = check_text(text)
    return CheckResponse(**result)
