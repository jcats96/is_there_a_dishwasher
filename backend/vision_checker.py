"""ONNX-based dishwasher image classifier used by the FastAPI backend.

The ONNX session is loaded lazily on the first call so the server starts up
even when the model file has not been trained yet (text-only mode still works).

Requires (already in requirements.txt):
    onnxruntime>=1.17.0
    Pillow>=10.0.0
    httpx>=0.27.0
"""

from __future__ import annotations

import io
from pathlib import Path

import httpx
import numpy as np
from PIL import Image

# ── Constants ────────────────────────────────────────────────────────────────

_MODEL_PATH = Path(__file__).parent / "models" / "dishwasher_classifier.onnx"

# ImageNet normalisation (must match the values used in train.py)
_MEAN = np.array([0.485, 0.456, 0.406], dtype=np.float32)
_STD = np.array([0.229, 0.224, 0.225], dtype=np.float32)

# class_to_idx produced by ImageFolder with sorted class names:
#   {'dishwasher': 0, 'no_dishwasher': 1}
_DISHWASHER_CLASS_INDEX = 0

# ── Session (lazy) ───────────────────────────────────────────────────────────

_session = None


def _get_session():
    global _session
    if _session is not None:
        return _session

    try:
        import onnxruntime as ort
    except ImportError as exc:
        raise RuntimeError(
            "onnxruntime is not installed. "
            "Add it to requirements.txt and reinstall."
        ) from exc

    if not _MODEL_PATH.exists():
        raise FileNotFoundError(
            f"Model file not found: {_MODEL_PATH}\n"
            "Train the model first:\n"
            "  pip install -r requirements_train.txt\n"
            "  python download_dataset.py\n"
            "  python train.py"
        )

    _session = ort.InferenceSession(
        str(_MODEL_PATH),
        providers=["CPUExecutionProvider"],
    )
    return _session


# ── Preprocessing ────────────────────────────────────────────────────────────

def _preprocess(img: Image.Image) -> np.ndarray:
    """Return a (1, 3, 224, 224) float32 array ready for ONNX inference."""
    img = img.convert("RGB").resize((224, 224), Image.Resampling.BILINEAR)
    arr = np.array(img, dtype=np.float32) / 255.0   # [0, 1]
    arr = (arr - _MEAN) / _STD                       # ImageNet normalise
    return arr.transpose(2, 0, 1)[np.newaxis]        # (1, 3, 224, 224)


def _softmax(x: np.ndarray) -> np.ndarray:
    e = np.exp(x - x.max())
    return e / e.sum()


# ── Public API ───────────────────────────────────────────────────────────────

def is_model_available() -> bool:
    """Return True if the trained ONNX model file exists on disk."""
    return _MODEL_PATH.exists()


def check_image(image_url: str, confidence_threshold: float = 0.5) -> dict:
    """
    Fetch *image_url* and classify whether it shows a dishwasher.

    Returns a dict compatible with the existing checker.py response shape::

        {
            "has_dishwasher": bool,
            "method": "image",
            "evidence": "<confidence>% confidence",
        }

    Raises
    ------
    FileNotFoundError
        If the ONNX model file has not been created yet.
    httpx.HTTPError
        If the image cannot be fetched.
    """
    session = _get_session()

    response = httpx.get(image_url, timeout=10, follow_redirects=True)
    response.raise_for_status()

    img = Image.open(io.BytesIO(response.content))
    arr = _preprocess(img)

    logits = session.run(["logits"], {"image": arr})[0]  # (1, 2)
    probs = _softmax(logits[0])                          # (2,)
    confidence = float(probs[_DISHWASHER_CLASS_INDEX])
    has_dishwasher = confidence >= confidence_threshold

    return {
        "has_dishwasher": has_dishwasher,
        "method": "image",
        "evidence": f"{confidence * 100:.1f}% confidence",
    }
