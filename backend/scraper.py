"""
scraper.py — fetch Zillow listing text.

Strategy:
1. Try a plain HTTPS request and look for the __NEXT_DATA__ JSON blob that
   Zillow embeds in every Next.js page.  This avoids spinning up a full
   browser and is fast enough for v0.1.
2. Fall back to Playwright (headless Chromium) if the plain request fails
   or returns a bot-challenge page.

Returns a single string of all the human-readable text from the listing so
that the checker module can search it for "dishwasher".
"""

from __future__ import annotations

import json
import re
from typing import Any
from urllib.parse import urlparse

import httpx
from bs4 import BeautifulSoup

# Zillow embeds structured listing data inside a <script id="__NEXT_DATA__">
# tag.  Pulling text from this JSON is more reliable than scraping the rendered
# DOM because Zillow's class names are hashed and change frequently.
_NEXT_DATA_RE = re.compile(
    r'<script[^>]+id=["\']__NEXT_DATA__["\'][^>]*>(.*?)</script>',
    re.DOTALL,
)

_REQUEST_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/124.0.0.0 Safari/537.36"
    ),
    "Accept": (
        "text/html,application/xhtml+xml,application/xml;q=0.9,"
        "image/avif,image/webp,*/*;q=0.8"
    ),
    "Accept-Language": "en-US,en;q=0.9",
}

# Only Zillow listing pages are supported in v0.1.
_ALLOWED_HOSTS = {"www.zillow.com", "zillow.com"}


def _validate_url(url: str) -> str:
    """
    Validate *url* and return a normalised, safe copy.

    Only HTTPS (or HTTP) requests to zillow.com are permitted.
    The returned URL is reconstructed from parsed components to break
    any taint propagation from the raw user-supplied string.

    Raises
    ------
    ValueError
        If the URL scheme or host is not allowed.
    """
    try:
        parsed = urlparse(url)
    except Exception as exc:
        raise ValueError(f"Invalid URL: {exc}") from exc

    if parsed.scheme not in ("https", "http"):
        raise ValueError("Only http/https URLs are supported.")

    host = (parsed.hostname or "").lower()
    if host not in _ALLOWED_HOSTS:
        raise ValueError(
            f"Only Zillow listing URLs are supported (got host: {host!r})."
        )

    # Reconstruct from validated components so the rest of the code never
    # touches the raw user input again.
    safe_url = parsed._replace(scheme=parsed.scheme, netloc=parsed.netloc).geturl()
    return safe_url


def _flatten_json(obj: Any, parts: list[str]) -> None:
    """Recursively collect all string leaves from a JSON value."""
    if isinstance(obj, str):
        parts.append(obj)
    elif isinstance(obj, dict):
        for v in obj.values():
            _flatten_json(v, parts)
    elif isinstance(obj, list):
        for item in obj:
            _flatten_json(item, parts)


def _extract_text_from_html(html: str) -> str:
    """Pull all visible text out of raw HTML."""
    soup = BeautifulSoup(html, "html.parser")

    # Remove script / style noise
    for tag in soup(["script", "style", "noscript"]):
        tag.decompose()

    # Try __NEXT_DATA__ first — richest source for Zillow
    match = _NEXT_DATA_RE.search(html)
    if match:
        try:
            data = json.loads(match.group(1))
            parts: list[str] = []
            _flatten_json(data, parts)
            # Also grab visible text in case the JSON omits something
            parts.append(soup.get_text(" "))
            return " ".join(parts)
        except json.JSONDecodeError:
            pass

    return soup.get_text(" ")


def _fetch_with_httpx(url: str) -> str | None:
    """Attempt a plain HTTPS GET.  Returns HTML or None on failure."""
    try:
        with httpx.Client(
            headers=_REQUEST_HEADERS,
            follow_redirects=True,
            timeout=15,
        ) as client:
            resp = client.get(url)
            resp.raise_for_status()
            # If Zillow served a bot-challenge / CAPTCHA page the body will be
            # very short and will not contain __NEXT_DATA__.
            if len(resp.text) < 5000:
                return None
            return resp.text
    except Exception:
        return None


def _fetch_with_playwright(url: str) -> str:
    """Full headless-browser fetch using Playwright (Chromium)."""
    from playwright.sync_api import sync_playwright  # lazy import

    with sync_playwright() as pw:
        browser = pw.chromium.launch(headless=True)
        page = browser.new_page(extra_http_headers=_REQUEST_HEADERS)
        page.goto(url, wait_until="domcontentloaded", timeout=30_000)
        # Give JS a moment to hydrate the page
        page.wait_for_timeout(2000)
        html = page.content()
        browser.close()
        return html


def scrape_listing_text(url: str) -> str:
    """
    Fetch a Zillow listing page and return all extractable text.

    Parameters
    ----------
    url:
        The listing URL.  Must be an HTTPS URL on zillow.com.

    Raises
    ------
    ValueError
        If *url* is not a valid, allowed Zillow URL.
    RuntimeError
        If the page could not be fetched at all.
    """
    safe_url = _validate_url(url)
    html = _fetch_with_httpx(safe_url)
    if html is None:
        # Fall back to headless browser
        try:
            html = _fetch_with_playwright(safe_url)
        except Exception as exc:
            raise RuntimeError(
                f"Could not fetch listing page: {exc}"
            ) from exc

    return _extract_text_from_html(html)
