#!/usr/bin/env python3
"""
Fine-tune MobileNetV3-Small as a binary dishwasher classifier and export
the result as an ONNX file that the FastAPI backend can load at runtime.

Usage
-----
    # Install training deps first
    pip install -r requirements_train.txt

    # Download the dataset (run once)
    python download_dataset.py

    # Train with default settings
    python train.py

    # Override common hyperparameters
    python train.py --epochs 30 --batch-size 64 --lr 3e-4

Expected data layout (created by download_dataset.py)
------------------------------------------------------
    data/
    ├── train/
    │   ├── dishwasher/
    │   └── no_dishwasher/
    ├── val/
    │   ├── dishwasher/
    │   └── no_dishwasher/
    └── test/   (optional — evaluated at the end if present)
        ├── dishwasher/
        └── no_dishwasher/

Output
------
    backend/models/dishwasher_classifier.onnx  (~9 MB, FP32)

The ONNX file is committed to the repository so the backend has no external
download step at startup.  See README.md for Git LFS notes.
"""

from __future__ import annotations

import argparse
import time
from pathlib import Path

import torch
import torch.nn as nn
from torch.utils.data import DataLoader
import torchvision.transforms as T
from torchvision.datasets import ImageFolder
from torchvision.models import mobilenet_v3_small, MobileNet_V3_Small_Weights

# ImageNet normalisation constants (shared with vision_checker.py)
_MEAN = [0.485, 0.456, 0.406]
_STD = [0.229, 0.224, 0.225]

EXPECTED_CLASSES = {"dishwasher", "no_dishwasher"}


# ── Transforms ───────────────────────────────────────────────────────────────

def _train_transform() -> T.Compose:
    return T.Compose([
        T.RandomResizedCrop(224),
        T.RandomHorizontalFlip(),
        T.ColorJitter(brightness=0.3, contrast=0.3, saturation=0.3),
        T.ToTensor(),
        T.Normalize(_MEAN, _STD),
    ])


def _val_transform() -> T.Compose:
    return T.Compose([
        T.Resize(256),
        T.CenterCrop(224),
        T.ToTensor(),
        T.Normalize(_MEAN, _STD),
    ])


# ── Model ────────────────────────────────────────────────────────────────────

def build_model() -> nn.Module:
    """Return MobileNetV3-Small with the final layer replaced for 2-class output."""
    weights = MobileNet_V3_Small_Weights.IMAGENET1K_V1
    model = mobilenet_v3_small(weights=weights)
    in_features = model.classifier[3].in_features
    model.classifier[3] = nn.Linear(in_features, 2)
    return model


# ── Training / validation steps ──────────────────────────────────────────────

def _train_epoch(
    model: nn.Module,
    loader: DataLoader,
    criterion: nn.Module,
    optimizer: torch.optim.Optimizer,
    device: str,
) -> tuple[float, float]:
    model.train()
    total_loss, correct, total = 0.0, 0, 0
    for imgs, labels in loader:
        imgs, labels = imgs.to(device), labels.to(device)
        optimizer.zero_grad()
        outputs = model(imgs)
        loss = criterion(outputs, labels)
        loss.backward()
        optimizer.step()
        total_loss += loss.item() * imgs.size(0)
        _, preds = outputs.max(1)
        correct += preds.eq(labels).sum().item()
        total += imgs.size(0)
    return total_loss / total, correct / total


@torch.no_grad()
def _evaluate(
    model: nn.Module,
    loader: DataLoader,
    criterion: nn.Module,
    device: str,
) -> tuple[float, float]:
    model.eval()
    total_loss, correct, total = 0.0, 0, 0
    for imgs, labels in loader:
        imgs, labels = imgs.to(device), labels.to(device)
        outputs = model(imgs)
        loss = criterion(outputs, labels)
        total_loss += loss.item() * imgs.size(0)
        _, preds = outputs.max(1)
        correct += preds.eq(labels).sum().item()
        total += imgs.size(0)
    return total_loss / total, correct / total


# ── ONNX export ──────────────────────────────────────────────────────────────

def export_onnx(model: nn.Module, output_path: Path, device: str) -> None:
    model.eval()
    dummy = torch.randn(1, 3, 224, 224, device=device)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    torch.onnx.export(
        model,
        dummy,
        str(output_path),
        input_names=["image"],
        output_names=["logits"],
        dynamic_axes={"image": {0: "batch"}},
        opset_version=17,
    )
    size_mb = output_path.stat().st_size / 1_048_576
    print(f"Exported  {output_path}  ({size_mb:.1f} MB)")


# ── Main ─────────────────────────────────────────────────────────────────────

def main() -> None:
    parser = argparse.ArgumentParser(
        description="Train dishwasher binary classifier → ONNX",
        formatter_class=argparse.ArgumentDefaultsHelpFormatter,
    )
    parser.add_argument("--data-dir", default="data",
                        help="Root data directory (must contain train/ and val/)")
    parser.add_argument(
        "--output", default="backend/models/dishwasher_classifier.onnx",
        help="Output path for the ONNX model",
    )
    parser.add_argument("--epochs", type=int, default=20,
                        help="Maximum number of training epochs")
    parser.add_argument("--batch-size", type=int, default=32)
    parser.add_argument("--lr", type=float, default=1e-4,
                        help="Initial learning rate (AdamW)")
    parser.add_argument("--patience", type=int, default=5,
                        help="Early-stopping patience in epochs (val accuracy)")
    parser.add_argument(
        "--device", default="",
        help="Training device: 'cuda', 'mps', or 'cpu'. Auto-detected if empty.",
    )
    parser.add_argument(
        "--workers", type=int, default=4,
        help="DataLoader worker threads (use 0 on Windows)",
    )
    args = parser.parse_args()

    # ── Device ───────────────────────────────────────────────────────────────
    if args.device:
        device = args.device
    elif torch.cuda.is_available():
        device = "cuda"
    elif torch.backends.mps.is_available():
        device = "mps"
    else:
        device = "cpu"
    print(f"Device: {device}")

    # ── Data ─────────────────────────────────────────────────────────────────
    data_dir = Path(args.data_dir)
    train_ds = ImageFolder(str(data_dir / "train"), transform=_train_transform())
    val_ds = ImageFolder(str(data_dir / "val"), transform=_val_transform())

    if set(train_ds.classes) != EXPECTED_CLASSES:
        raise SystemExit(
            f"Expected classes {sorted(EXPECTED_CLASSES)}, "
            f"got {train_ds.classes}.\n"
            "Run download_dataset.py first, or check your data directory layout."
        )

    pin = device == "cuda"
    train_dl = DataLoader(train_ds, batch_size=args.batch_size, shuffle=True,
                          num_workers=args.workers, pin_memory=pin)
    val_dl = DataLoader(val_ds, batch_size=args.batch_size, shuffle=False,
                        num_workers=args.workers, pin_memory=pin)

    print(f"Train: {len(train_ds)} images  |  Val: {len(val_ds)} images")
    print(f"Class → index: {train_ds.class_to_idx}")

    # ── Model ────────────────────────────────────────────────────────────────
    model = build_model().to(device)
    criterion = nn.CrossEntropyLoss()
    optimizer = torch.optim.AdamW(model.parameters(), lr=args.lr, weight_decay=1e-4)
    scheduler = torch.optim.lr_scheduler.CosineAnnealingLR(optimizer, T_max=args.epochs)

    # ── Training loop ────────────────────────────────────────────────────────
    best_val_acc = 0.0
    best_state: dict | None = None
    patience_counter = 0

    for epoch in range(1, args.epochs + 1):
        t0 = time.time()
        train_loss, train_acc = _train_epoch(model, train_dl, criterion, optimizer, device)
        val_loss, val_acc = _evaluate(model, val_dl, criterion, device)
        scheduler.step()
        elapsed = time.time() - t0

        print(
            f"Epoch {epoch:>3}/{args.epochs}  "
            f"train loss={train_loss:.4f} acc={train_acc:.3f}  "
            f"val loss={val_loss:.4f} acc={val_acc:.3f}  "
            f"({elapsed:.0f}s)"
        )

        if val_acc > best_val_acc:
            best_val_acc = val_acc
            best_state = {k: v.cpu().clone() for k, v in model.state_dict().items()}
            patience_counter = 0
            print(f"  ✓ New best val acc: {best_val_acc:.3f}")
        else:
            patience_counter += 1
            if patience_counter >= args.patience:
                print(f"Early stopping at epoch {epoch} (patience={args.patience})")
                break

    # ── Restore best weights and export ──────────────────────────────────────
    if best_state is not None:
        model.load_state_dict(best_state)
        print(f"\nRestored best weights (val acc={best_val_acc:.3f})")

    output_path = Path(args.output)
    export_onnx(model, output_path, device)

    # ── Optional test-set evaluation ─────────────────────────────────────────
    test_dir = data_dir / "test"
    if test_dir.exists():
        test_ds = ImageFolder(str(test_dir), transform=_val_transform())
        test_dl = DataLoader(test_ds, batch_size=args.batch_size, shuffle=False,
                             num_workers=args.workers, pin_memory=pin)
        _, test_acc = _evaluate(model, test_dl, criterion, device)
        print(f"Test accuracy: {test_acc:.3f}  ({len(test_ds)} images)")

    print("\nDone. Commit backend/models/dishwasher_classifier.onnx to the repo.")
    print("See README.md for Git LFS instructions.")


if __name__ == "__main__":
    main()
