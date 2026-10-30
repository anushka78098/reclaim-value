"""Module – dynamic price estimation. Uses trained model.joblib if present, else baseline formula."""
import os
from recommend import BASE_PRICE, COND_MULT
MODEL_PATH = os.path.join(os.path.dirname(__file__), "model.joblib")
_model = None
if os.path.exists(MODEL_PATH):
    import joblib
    _model = joblib.load(MODEL_PATH)
MATS = list(BASE_PRICE)


def features(material, condition, qty_kg, demand, distance_km):
    return [[MATS.index(material) if material in MATS else -1, "DCBA".find(condition[:1].upper()), qty_kg, demand, distance_km]]


def _baseline_unit_price(material, condition, quantity_kg, demand_index, distance_km):
    unit = BASE_PRICE.get(material, 5) * COND_MULT.get(condition[:1].upper(), 0.5) * (0.8 + 0.4 * demand_index)
    return unit * (1 - min(0.15, quantity_kg / 100000) - min(0.1, distance_km / 500))


def predict_price(material, condition, quantity_kg, demand_index=0.5, distance_km=10):
    material = material.lower()
    if _model is not None:
        unit = max(0.0, float(_model.predict(features(material, condition, quantity_kg, demand_index, distance_km))[0]))
        source = "ml-regression"
    else:
        unit = _baseline_unit_price(material, condition, quantity_kg, demand_index, distance_km)
        source = "baseline-heuristic"
    return {"unit_price": round(unit, 2), "total_price": round(unit * quantity_kg, 2),
            "range": [round(unit * quantity_kg * 0.9, 2), round(unit * quantity_kg * 1.1, 2)], "model": source}
