"""Module 1 – material recognition. YOLO when weights available, heuristic demo mode otherwise."""
import io, logging, os
import numpy as np
from PIL import Image

logger = logging.getLogger(__name__)
WEIGHTS = os.getenv("YOLO_WEIGHTS")
COND_WEIGHTS = os.getenv("CONDITION_WEIGHTS")
_cond = None
_yolo = None
_yolo_load_error = None
if not WEIGHTS:
    _yolo_load_error = "YOLO_WEIGHTS is not set"
elif not os.path.isfile(WEIGHTS):
    _yolo_load_error = "Configured YOLO weights file does not exist"
else:
    try:
        from ultralytics import YOLO
        _yolo = YOLO(WEIGHTS)
    except Exception as e:  # pragma: no cover
        _yolo_load_error = f"YOLO model load failed ({type(e).__name__}); check AI service logs"
        logger.exception("Failed to load YOLO material weights from %s", WEIGHTS)

if _yolo is None and _yolo_load_error:
    logger.warning("Material recognition is using demo fallback: %s", _yolo_load_error)

if COND_WEIGHTS and os.path.exists(COND_WEIGHTS):
    from ultralytics import YOLO as _Y
    _cond = _Y(COND_WEIGHTS)

DEFAULT_KG = {"steel": 800, "concrete": 1500, "brick": 600, "wood": 300, "tiles": 200, "glass": 150}


def model_status():
    return {
        "material_model": {
            "loaded": _yolo is not None,
            "weights_configured": bool(WEIGHTS),
            "weights_file_found": bool(WEIGHTS and os.path.isfile(WEIGHTS)),
            "error": _yolo_load_error,
        },
        "condition_model": {
            "loaded": _cond is not None,
            "weights_configured": bool(COND_WEIGHTS),
            "weights_file_found": bool(COND_WEIGHTS and os.path.isfile(COND_WEIGHTS)),
        },
    }


def rust_ratio(arr):
    r, g, b = arr[..., 0].astype(int), arr[..., 1].astype(int), arr[..., 2].astype(int)
    return float(((r > 110) & (r > g + 25) & (g > b) & (r < 220)).mean())


SEVERITY = {"low": .4, "fair": .4, "medium": .7, "moderate": .7, "poor": .8, "high": 1.0, "severe": 1.0}


def condition_from_model(img):
    """Weighted corroded-area fraction from a YOLO corrosion detector -> grade."""
    res = _cond(img, verbose=False)[0]; tot = img.width * img.height; damage = 0.0
    for box, cls in zip(res.boxes.xyxy.tolist(), res.boxes.cls.tolist()):
        w = next((v for k, v in SEVERITY.items() if k in res.names[int(cls)].lower()), .7)
        damage += (box[2] - box[0]) * (box[3] - box[1]) / tot * w
    score = round(1 - min(1.0, damage * 1.5), 2)
    return ("A" if score > .85 else "B" if score > .65 else "C" if score > .4 else "D"), score, round(damage, 3)


def condition_from_image(img):
    if _cond is not None: return condition_from_model(img)
    arr = np.asarray(img.convert("RGB").resize((256, 256)))
    rust = rust_ratio(arr)
    sharp = float(np.abs(np.diff(arr.mean(axis=2), axis=0)).mean())
    score = 1 - min(1, rust * 2.2) * 0.7 - (0.15 if sharp < 4 else 0)
    return "A" if score > .85 else "B" if score > .65 else "C" if score > .4 else "D", round(score, 2), round(rust, 3)


def heuristic_material(img):
    arr = np.asarray(img.convert("RGB").resize((64, 64))).reshape(-1, 3).mean(axis=0)
    r, g, b = arr
    if r > g > b and r - b > 40: return "wood" if g > 90 else "brick"
    if b >= r and abs(r - g) < 15 and arr.mean() < 120: return "steel"
    if arr.mean() > 170: return "tiles"
    if g > r and g > b: return "glass"
    return "concrete"


def analyze(image_bytes: bytes):
    img = Image.open(io.BytesIO(image_bytes)).convert("RGB")
    cond, cscore, rust = condition_from_image(img)
    fallback_reason = _yolo_load_error
    if _yolo is not None:
        res = _yolo(img, verbose=False)[0]
        if len(res.boxes):
            best = max(range(len(res.boxes)), key=lambda i: float(res.boxes.conf[i]))
            material = res.names[int(res.boxes.cls[best])].lower()
            conf = float(res.boxes.conf[best])
            x1, y1, x2, y2 = res.boxes.xyxy[best].tolist()
            area = (x2 - x1) * (y2 - y1) / (img.width * img.height)
            qty = DEFAULT_KG.get(material, 300) * (0.5 + area)
            return dict(material=material, confidence=round(conf, 2), condition=cond, condition_score=cscore,
                        quantity_kg=round(qty), demo_mode=False, model_loaded=True, fallback_reason=None)
        fallback_reason = "Model loaded but detected no objects in this image"
    material = heuristic_material(img)
    return dict(material=material, confidence=0.5, condition=cond, condition_score=cscore,
                quantity_kg=DEFAULT_KG[material], demo_mode=True, model_loaded=_yolo is not None,
                fallback_reason=fallback_reason, rust_ratio=rust)
