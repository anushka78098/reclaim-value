from pathlib import Path
from ultralytics import YOLO

MODEL = YOLO(str(Path(__file__).parent / "weights" / "materials.pt"))  # loaded once

def detect_material(image_path: str, conf: float = 0.25):
    result = MODEL.predict(image_path, conf=conf, verbose=False)[0]
    if len(result.boxes) == 0:
        return None

    # A pile has many boxes, so sum box area per class instead of taking the top box
    areas, confs = {}, {}
    for box in result.boxes:
        name = result.names[int(box.cls)]
        x1, y1, x2, y2 = box.xyxy[0].tolist()
        areas[name] = areas.get(name, 0) + (x2 - x1) * (y2 - y1)
        confs.setdefault(name, []).append(float(box.conf))

    total = sum(areas.values())
    best = max(areas, key=areas.get)
    return {
        "material": best,
        "confidence": round(sum(confs[best]) / len(confs[best]), 2),
        "share": {k: round(v / total, 2) for k, v in areas.items()},
        "detections": len(result.boxes),
    }