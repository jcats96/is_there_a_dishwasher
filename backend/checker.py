"""
checker.py — search listing text for the word "dishwasher".

Returns a structured result dict that the API layer passes straight back to
the frontend.
"""

from __future__ import annotations

import re

_PATTERN = re.compile(r"dishwasher", re.IGNORECASE)

# How many characters of context to show around the matched word
_CONTEXT_CHARS = 80


def check_text(text: str) -> dict:
    """
    Search *text* for the word "dishwasher" (case-insensitive).

    Returns
    -------
    dict with keys:
        has_dishwasher : bool
        method         : "text"  (always, for this stage)
        evidence       : str | None  — surrounding snippet, or None
    """
    match = _PATTERN.search(text)

    if match:
        start = max(0, match.start() - _CONTEXT_CHARS)
        end = min(len(text), match.end() + _CONTEXT_CHARS)
        snippet = text[start:end].strip()
        # Normalise whitespace so the snippet reads cleanly in the UI
        snippet = re.sub(r"\s+", " ", snippet)
        return {
            "has_dishwasher": True,
            "method": "text",
            "evidence": f"…{snippet}…",
        }

    return {
        "has_dishwasher": False,
        "method": "text",
        "evidence": None,
    }
