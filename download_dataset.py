#!/usr/bin/env python3
"""
Download and organise a dishwasher / no-dishwasher image dataset from
Google Open Images v7.

Usage
-----
    # Install training deps first
    pip install -r requirements_train.txt

    # Download with default settings (~4 000 images per class)
    python download_dataset.py

    # Customise limits
    python download_dataset.py --limit-pos 2000 --limit-neg 2000

Output layout (compatible with torchvision.datasets.ImageFolder and train.py)
------------------------------------------------------------------------------
    data/
    ├── train/
    │   ├── dishwasher/       # 70 % of positives
    │   └── no_dishwasher/    # 70 % of negatives
    ├── val/
    │   ├── dishwasher/       # 15 % of positives
    │   └── no_dishwasher/    # 15 % of negatives
    └── test/
        ├── dishwasher/       # 15 % of positives
        └── no_dishwasher/    # 15 % of negatives

After this script finishes, run:
    python train.py
"""

from __future__ import annotations

import argparse
import math
import random
import shutil
from pathlib import Path


# ── Helpers ──────────────────────────────────────────────────────────────────

def _require_openimages() -> None:
    try:
        import openimages  # noqa: F401
    except ImportError:
        raise SystemExit(
            "The 'openimages' package is not installed.\n"
            "Install training requirements with:\n"
            "  pip install -r requirements_train.txt"
        )


def _download_class(label: str, dest: Path, limit: int) -> None:
    """Download Open Images images for *label* into *dest*."""
    from openimages.download import download_dataset

    dest.mkdir(parents=True, exist_ok=True)
    print(f"  Downloading '{label}' → {dest}  (limit={limit}) …")
    download_dataset(str(dest), [label], limit=limit)


def _collect_images(directory: Path) -> list[Path]:
    """Return a sorted list of JPEG images under *directory* (recursive)."""
    return sorted(directory.rglob("*.jpg"))


def _copy_split(
    images: list[Path],
    start: int,
    end: int,
    dest: Path,
) -> None:
    dest.mkdir(parents=True, exist_ok=True)
    for img in images[start:end]:
        shutil.copy2(img, dest / img.name)


# ── Main ─────────────────────────────────────────────────────────────────────

def main() -> None:
    parser = argparse.ArgumentParser(
        description="Download Open Images v7 dishwasher dataset for training",
        formatter_class=argparse.ArgumentDefaultsHelpFormatter,
    )
    parser.add_argument(
        "--limit-pos", type=int, default=4000,
        help="Max positive (dishwasher) images to download",
    )
    parser.add_argument(
        "--limit-neg", type=int, default=4000,
        help="Max negative (kitchen without dishwasher) images to download",
    )
    parser.add_argument(
        "--data-dir", default="data",
        help="Root directory for dataset output",
    )
    parser.add_argument("--seed", type=int, default=42, help="Random seed")
    args = parser.parse_args()

    _require_openimages()
    random.seed(args.seed)

    data_dir = Path(args.data_dir)
    raw_dir = data_dir / "raw"

    # ── Download ─────────────────────────────────────────────────────────────
    _download_class("Dishwasher", raw_dir / "dishwasher", args.limit_pos)
    _download_class("Kitchen", raw_dir / "kitchen", args.limit_neg)

    # ── Collect files ────────────────────────────────────────────────────────
    # The openimages package stores images in a subdirectory named after the
    # label, e.g. raw/dishwasher/Dishwasher/*.jpg
    pos_images = _collect_images(raw_dir / "dishwasher")
    neg_images = _collect_images(raw_dir / "kitchen")

    if not pos_images or not neg_images:
        raise SystemExit(
            "No images were found after download.\n"
            "Check your internet connection and try again."
        )

    # Balance the classes and shuffle
    n = min(len(pos_images), len(neg_images))
    random.shuffle(pos_images)
    random.shuffle(neg_images)
    pos_images = pos_images[:n]
    neg_images = neg_images[:n]

    print(f"\nUsing {n} images per class (balanced).")

    # ── Split 70 / 15 / 15 ───────────────────────────────────────────────────
    n_train = math.floor(n * 0.70)
    n_val = math.floor(n * 0.15)
    # remainder goes to test
    slices = {
        "train": (0, n_train),
        "val": (n_train, n_train + n_val),
        "test": (n_train + n_val, n),
    }

    print(f"Split: {n_train} train / {n_val} val / {n - n_train - n_val} test per class\n")

    for split_name, (start, end) in slices.items():
        _copy_split(pos_images, start, end, data_dir / split_name / "dishwasher")
        _copy_split(neg_images, start, end, data_dir / split_name / "no_dishwasher")

    # ── Summary ──────────────────────────────────────────────────────────────
    print("Dataset ready:")
    for split_name in ("train", "val", "test"):
        for cls in ("dishwasher", "no_dishwasher"):
            count = len(list((data_dir / split_name / cls).glob("*.jpg")))
            print(f"  {split_name}/{cls}: {count} images")

    print(f"\nNext step:\n  python train.py --data-dir {args.data_dir}")


if __name__ == "__main__":
    main()
