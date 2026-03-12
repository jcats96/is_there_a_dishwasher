# Dishwasher Detection in Images — Research Notes

## 1. Overview

Detecting a dishwasher in a real-estate listing photo is a specific instance of
**kitchen-appliance object detection**. This document surveys the available
techniques, datasets, and libraries, and recommends an approach that fits the
project's existing architecture (headless-scrape → vision check pipeline).

---

## 2. Why Image Detection Is Needed

Listing text is the fastest and cheapest signal, but it is unreliable:

- Property managers often omit amenities in the description even when they are
  present.
- Amenity checkboxes on listing sites may be out of date or unchecked by
  mistake.
- In-unit dishwashers are sometimes labelled as "built-in" without using the
  word "dishwasher".

When the text check draws a blank, the only ground truth is the photos.

---

## 3. What a Dishwasher Looks Like in Listing Photos

Kitchen listing photos vary widely, but a dishwasher almost always appears as
one of these visual cues:

| Cue | Detail |
|-----|--------|
| **Front panel** | Flat rectangular door, usually stainless or white, flush with cabinets |
| **Control strip** | Buttons / LED indicators on the top edge of the door (hidden-control models) or a visible control panel |
| **Handle** | Horizontal bar handle, often matching the oven or other appliances |
| **Brand badge** | Bosch, Miele, KitchenAid, Whirlpool, Samsung, etc. |
| **Open-door shot** | Exposed racks, silverware basket, interior spray arms |
| **Context clues** | Positioned beside or under the kitchen sink, between lower cabinets |

Kitchen photos in listings are typically taken from a wide angle; the
dishwasher may occupy only 10–20 % of the frame, making detection harder than
in close-up product photography.

---

## 4. Detection Approaches

### 4.1 Vision Language Models (VLMs) — Current Approach

The architecture already uses **GPT-4o** as a fallback classifier. This is the
simplest path to production because:

- No dataset collection or model training required.
- Handles open-ended kitchen layouts, unusual angles, and partially visible
  appliances through natural language reasoning.
- Easy to prompt-tune: "Does this kitchen photo show a dishwasher? Answer yes
  or no and give a one-sentence reason."
- GPT-4o Vision API accepts image URLs directly.

**Weaknesses:**
- Per-image cost (~$0.002–$0.01 per image depending on resolution).
- Latency: 1–3 seconds per image call.
- Dependency on a third-party service; API key required.

**Alternative VLMs to consider:**

| Model | Provider | Notes |
|-------|----------|-------|
| GPT-4o | OpenAI | Best general accuracy; current choice |
| Claude 3.5 Sonnet | Anthropic | Comparable vision quality |
| Gemini 1.5 Flash | Google | Faster and cheaper; slightly lower accuracy |
| LLaVA / Idefics | Open-source | Self-hostable; requires GPU |

---

### 4.2 Custom Object-Detection Model

Train or fine-tune a model to locate a dishwasher (bounding box) within a
kitchen photo.

#### 4.2.1 Baseline — COCO Pre-trained Models

The standard COCO-80 class list includes `refrigerator`, `oven`, `microwave`,
and `toaster`, but **does not include `dishwasher`**. Off-the-shelf COCO
models will not detect dishwashers without retraining or fine-tuning.

#### 4.2.2 Available Datasets

| Dataset | Source | Size | Notes |
|---------|--------|------|-------|
| Roboflow "Dishwasher" dataset | [Roboflow Universe](https://universe.roboflow.com/dishwasher-dataset/dishwasher-uoccr) | ~300–500 images | Bounding-box labels; cups, plates, bowls also labelled |
| ADE20K (kitchen scenes) | MIT CSAIL | 20 k+ scenes | Scene-level segmentation; not appliance-specific |
| Open Images v7 | Google | 9 M images | Contains `Dishwasher` class (~4 k images, bounding boxes) |
| ImageNet (LSVRC) | Stanford/Google | 1.2 M images | Classification only; `dishwasher` synset n02843684 |

**Recommended starting dataset:** Google's **Open Images v7** `Dishwasher`
class provides the most labelled examples and is free for non-commercial use.

#### 4.2.3 Recommended Architecture — YOLOv8

[YOLOv8](https://docs.ultralytics.com/) (Ultralytics) is the practical choice:

- Pre-trained on COCO; easy fine-tuning on a custom class.
- Fast inference: < 50 ms per image on CPU (YOLOv8n), < 10 ms on GPU.
- Straightforward Python API.
- Runs in a Docker container or as a serverless function.

**Fine-tuning sketch:**

```python
from ultralytics import YOLO

# Start from a COCO-pretrained nano model
model = YOLO("yolov8n.pt")

# Fine-tune on a dishwasher dataset exported in YOLO format
model.train(data="dishwasher.yaml", epochs=50, imgsz=640)

# Export for production inference
model.export(format="onnx")
```

**Inference in the classifier module:**

```python
from ultralytics import YOLO
import requests
from PIL import Image
from io import BytesIO

model = YOLO("dishwasher_yolov8n.pt")

def has_dishwasher(image_url: str) -> bool:
    resp = requests.get(image_url, timeout=10)
    img = Image.open(BytesIO(resp.content))
    results = model(img)
    return any(
        model.names[int(cls)] == "dishwasher"
        for r in results
        for cls in r.boxes.cls
    )
```

**Strengths:**
- No per-inference API cost after training.
- Runs fully on-premises; no data leaves the server.
- Returns bounding box coordinates — can highlight the dishwasher in the UI.

**Weaknesses:**
- Dataset collection and labelling effort upfront.
- Model maintenance when appliance styles change.
- Requires GPU for comfortable training (or a cloud training job).

---

### 4.3 Zero-Shot / Few-Shot Classification (CLIP)

OpenAI's **CLIP** model maps images and text into the same embedding space.
It can classify without task-specific training:

```python
import clip
import torch
from PIL import Image

model, preprocess = clip.load("ViT-B/32", device="cpu")

image = preprocess(Image.open("kitchen.jpg")).unsqueeze(0)
texts = clip.tokenize(["a kitchen with a dishwasher",
                       "a kitchen without a dishwasher"])
with torch.no_grad():
    logits, _ = model(image, texts)
    probs = logits.softmax(dim=-1)

has_dishwasher = probs[0][0].item() > 0.5
```

CLIP runs locally on CPU, has no API cost, and requires no fine-tuning. Its
zero-shot accuracy is lower than a fine-tuned YOLOv8 or GPT-4o, but it is a
useful cheap-and-fast middle tier.

---

## 5. Recommended Detection Pipeline

A three-stage cascade minimises cost while maximising accuracy:

```
Stage 1 — Text (free, < 100 ms)
  → search listing text for "dishwasher"
  → if found: return true

Stage 2 — CLIP zero-shot (free, ~200 ms/image, runs locally)
  → score each image with CLIP
  → if confidence > threshold: return true

Stage 3 — GPT-4o Vision (paid, ~1–3 s/image)
  → send low-confidence images to GPT-4o for confirmation
  → return GPT-4o answer
```

Stage 2 acts as a pre-filter: it knocks out clear negatives cheaply so that
Stage 3 only processes the ambiguous cases, reducing API spend.

Alternatively, replace Stage 2 with a fine-tuned YOLOv8 model once sufficient
labelled data is available.

---

## 6. Handling Difficult Cases

| Challenge | Mitigation |
|-----------|-----------|
| Dishwasher not in frame / listing has no kitchen photo | Return `has_dishwasher: false, method: "image"` after exhausting all images; surface this uncertainty in the UI |
| Partially open dishwasher (racks visible) | VLMs and fine-tuned models both handle this well |
| Integrated / panel-ready dishwasher (blends with cabinets) | Hard even for humans; VLM with explicit prompt performs best |
| Low-resolution or compressed listing photos | Resize to ≥ 640 px before inference; JPEG artefacts rarely cause misclassification |
| Dishwasher in a different room (e.g., laundry room) | Context-aware prompting: "Is this a kitchen photo? If yes, does it show a dishwasher?" |

---

## 7. Summary Recommendation

For the current stage of the project, **keep GPT-4o Vision as the image
classifier** — it requires no dataset work and delivers high accuracy. As
listing volume grows and API costs become material, layer in a **CLIP
zero-shot pre-filter** to reduce the number of images sent to the Vision API,
and evaluate fine-tuning **YOLOv8 on Open Images v7** for a fully offline
fallback.
