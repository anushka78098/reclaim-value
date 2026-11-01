import os
from pathlib import Path

MODEL_PATH = Path(
    os.getenv("YOLO_WEIGHTS")
    or Path(__file__).parent / "weights" / "materials.pt"
).expanduser()
MODEL = None


def _load_model():
    global MODEL
    if MODEL is None:
        if not MODEL_PATH.is_file():
            raise FileNotFoundError(f"YOLO weights file does not exist: {MODEL_PATH}")
        from ultralytics import YOLO

        MODEL = YOLO(str(MODEL_PATH))
    return MODEL


def detect_material(image_path: str, conf: float = 0.25):
    if not 0 <= conf <= 1:
        raise ValueError("conf must be between 0 and 1")
    if not Path(image_path).is_file():
        raise FileNotFoundError(f"Image file does not exist: {image_path}")

    results = _load_model().predict(image_path, conf=conf, verbose=False)
    if not results:
        return None

    result = results[0]
    areas = {}
    confidences = {}
    detections = 0
    for box in result.boxes:
        name = result.names[int(box.cls)].lower()
        confidence = float(box.conf)
        if confidence < conf or (name == "steel" and confidence < 0.5):
            continue

        x1, y1, x2, y2 = box.xyxy[0].tolist()
        area = max(0.0, x2 - x1) * max(0.0, y2 - y1)
        if area == 0:
            continue

        areas[name] = areas.get(name, 0.0) + area
        confidences.setdefault(name, []).append(confidence)
        detections += 1

    total_area = sum(areas.values())
    if total_area == 0:
        return None

    best = max(areas, key=areas.get)
    return {
        "material": best,
        "confidence": round(sum(confidences[best]) / len(confidences[best]), 2),
        "share": {name: round(area / total_area, 2) for name, area in areas.items()},
        "detections": detections,
    }
