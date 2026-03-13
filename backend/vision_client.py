"""
vision_client.py — external API adapter for Stage 2 vision detection.

Sends a listing photo URL to a configurable vision API and asks whether
the image shows a dishwasher.  Defaults to the OpenAI-compatible chat
completions endpoint (OpenAI, Azure OpenAI, or any compatible provider).

Configuration is done entirely via environment variables — no secrets
appear in source code.  See `.env.example` for the full list of variables.
"""

from __future__ import annotations

import asyncio
import logging
import os

import httpx

logger = logging.getLogger(__name__)

_ENDPOINT = os.getenv(
    "VISION_API_ENDPOINT",
    "https://api.openai.com/v1/chat/completions",
)
_MODEL = os.getenv("VISION_MODEL", "gpt-4o-mini")
_API_KEY = os.getenv("VISION_API_KEY", "")
_TIMEOUT = int(os.getenv("VISION_TIMEOUT_SECONDS", "30"))

_PROMPT = (
    "Does this photo show a dishwasher? "
    "Answer with exactly one word: yes or no."
)


def is_vision_enabled() -> bool:
    """Return True if the vision API is configured and usable."""
    endpoint = os.getenv("VISION_API_ENDPOINT", "https://api.openai.com/v1/chat/completions")
    api_key = os.getenv("VISION_API_KEY", "")
    # Allow empty key only for localhost (self-hosted models like Ollama)
    if not api_key and "localhost" not in endpoint and "127.0.0.1" not in endpoint:
        return False
    return True


async def has_dishwasher_in_image(image_url: str) -> tuple[bool, str | None]:
    """
    Ask the configured vision API whether *image_url* shows a dishwasher.

    Parameters
    ----------
    image_url:
        A publicly accessible URL pointing to a listing photo.

    Returns
    -------
    (True, reason_string)   — dishwasher detected
    (False, None)           — not detected, inconclusive, or API error
    """
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
        "max_tokens": 10,
    }
    headers = {
        "Authorization": f"Bearer {_API_KEY}",
        "Content-Type": "application/json",
    }

    for attempt in range(2):
        try:
            async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
                response = await client.post(_ENDPOINT, json=payload, headers=headers)
                response.raise_for_status()
            break
        except httpx.HTTPStatusError as exc:
            status = exc.response.status_code
            logger.error(
                "Vision API HTTP %s on attempt %d: %s",
                status,
                attempt + 1,
                exc.response.text[:200],
            )
            # 4xx errors (bad key, quota) are not worth retrying
            if 400 <= status < 500:
                return False, None
            # 5xx: retry once after a short delay
            if attempt == 0:
                await asyncio.sleep(1)
                continue
            return False, None
        except Exception as exc:
            logger.error("Vision API request failed on attempt %d: %s", attempt + 1, exc)
            if attempt == 0:
                await asyncio.sleep(1)
                continue
            return False, None

    try:
        answer = (
            response.json()["choices"][0]["message"]["content"]
            .strip()
            .lower()
        )
    except Exception as exc:
        logger.error("Could not parse vision API response: %s", exc)
        return False, None

    if answer.startswith("yes"):
        return True, answer
    return False, None
