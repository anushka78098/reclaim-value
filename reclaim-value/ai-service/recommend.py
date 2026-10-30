"""Module 2 – multi-variable recommendation engine (Reuse / Sell / Recycle / Dispose)."""
BASE_PRICE = {"steel": 40, "concrete": 1.5, "brick": 6, "wood": 25, "tiles": 18, "glass": 10}   # INR / kg resale (Grade A)
SCRAP_PRICE = {"steel": 12.5, "concrete": 0.3, "brick": 1, "wood": 4, "tiles": 2, "glass": 1.5}  # INR / kg recycling
CO2_PER_KG = {"steel": 1.5, "concrete": 0.1, "brick": 0.22, "wood": 0.4, "tiles": 0.7, "glass": 0.85}
COND_MULT = {"A": 1.0, "B": 0.8, "C": 0.55, "D": 0.25}
COND_SCORE = {"A": 1.0, "B": 0.75, "C": 0.45, "D": 0.15}


def estimate_value(material, condition, qty_kg, demand=0.5):
    base = BASE_PRICE.get(material, 5) * COND_MULT.get(condition, 0.5)
    return round(base * (0.8 + 0.4 * demand) * qty_kg, 2)


def recommend(material, condition, quantity_kg, demand_index=0.5, distance_km=10, storage_days=0):
    material = material.lower(); condition = condition.upper()[:1]
    cond = COND_SCORE.get(condition, 0.3)
    prox = max(0.0, 1 - distance_km / 50)
    freshness = max(0.0, 1 - storage_days / 180)
    sell = 0.40 * demand_index + 0.25 * prox + 0.25 * cond + 0.10 * freshness
    reuse = 0.50 * cond + 0.30 * (1 - demand_index) + 0.20 * freshness      # keep on-site when demand is low
    recycle = 0.45 * (1 - cond) + 0.25 * (1 - demand_index) + 0.30 * (1 if material in ("steel", "glass", "concrete") else 0.4)
    dispose = 0.6 * (1 - cond) ** 2 + 0.2 * (1 - freshness) - 0.2
    scores = {"Sell": sell, "Reuse": reuse, "Recycle": recycle, "Dispose": max(dispose, 0)}
    action = max(scores, key=scores.get)
    total = sum(scores.values()) or 1
    resale = estimate_value(material, condition, quantity_kg, demand_index)
    scrap = round(SCRAP_PRICE.get(material, 1) * quantity_kg, 2)
    ratio = round(resale / scrap, 1) if scrap else None
    co2_t = round(CO2_PER_KG.get(material, 0.1) * quantity_kg / 1000, 2) if action != "Dispose" else 0.0
    why = {
        "Sell": f"Local demand and Grade {condition} condition make resale worth {ratio}x the recycling scrap price.",
        "Reuse": "High condition and low market demand: reuse on a current or future project saves more than selling.",
        "Recycle": "Condition or demand is too low for resale; recycling recovers material value.",
        "Dispose": "Condition is too poor and storage cost outweighs any recovery value.",
    }[action]
    return {"action": action, "match_score": round(scores[action] / total * 100),
            "estimated_value": resale if action in ("Sell", "Reuse") else scrap,
            "avoided_co2_tons": co2_t, "scores": {k: round(v, 3) for k, v in scores.items()}, "justification": why}
