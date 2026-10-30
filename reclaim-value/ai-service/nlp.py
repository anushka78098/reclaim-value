"""Module 6 – NL query parsing + agent intent detection (rule-based; swap for an LLM/LangChain chain)."""
import re
MATERIALS = {"steel": "steel", "iron": "steel", "beam": "steel", "concrete": "concrete", "brick": "brick", "bricks": "brick",
             "wood": "wood", "timber": "wood", "tile": "tiles", "tiles": "tiles", "glass": "glass"}
CONDITION_WORDS = {"good": ["A", "B"], "best": ["A"], "excellent": ["A"], "new": ["A"], "fair": ["B", "C"], "cheap": ["C", "D"], "damaged": ["C", "D"]}


def _num(s):
    s = s.lower().replace(",", "").replace("₹", "").strip()
    if s.endswith("k"): return float(s[:-1]) * 1000
    return float(s)


def parse_query(q: str):
    ql = q.lower(); f = {}
    for w, m in MATERIALS.items():
        if re.search(rf"\b{w}\b", ql): f["material"] = m; break
    for w, c in CONDITION_WORDS.items():
        if re.search(rf"\b{w}\b", ql): f["condition"] = {"$in": [f"Grade {x}" for x in c]}; break
    m = re.search(r"(?:under|below|less than|max|upto|up to|<)\s*₹?\s*([\d,\.]+k?)", ql)
    if m: f["price"] = {"$lte": _num(m.group(1))}
    m = re.search(r"(?:over|above|more than|min|at least)\s*₹?\s*([\d,\.]+k?)\s*(?:rs|₹|inr)?", ql)
    if m and "price" not in f: f["price"] = {"$gte": _num(m.group(1))}
    m = re.search(r"within\s*(\d+)\s*km", ql)
    if m: f["distanceKm"] = {"$lte": int(m.group(1))}
    elif "near me" in ql or "nearby" in ql or "near" in ql: f["distanceKm"] = {"$lte": 25}
    return f


def agent_intent(msg: str):
    """Returns a function call spec: {tool, args, reply}."""
    m = msg.lower()
    if re.search(r"(create|publish|make).*(listing)", m) or "list my" in m:
        which = "highest_value" if re.search(r"highest|most valuable|best", m) else "latest"
        return {"tool": "create_listing", "args": {"select": which}, "reply": None}
    if (re.search(r"\b(?:how much|total|summary|stats)\b", m)
            or re.search(r"\b(?:my|our|inventory|estimated|listed)\s+(?:total\s+)?value\b", m)
            or re.search(r"\b(?:carbon|co2)\s+(?:saved|savings|summary|stats|footprint)\b", m)):
        return {"tool": "get_summary", "args": {}, "reply": None}
    if re.search(r"(inventory|what do i have|show.*materials|list.*materials|unused)", m):
        return {"tool": "list_inventory", "args": {"status": "Available" if "unused" in m else None}, "reply": None}
    return {"tool": None, "args": {}, "reply": "I can list your inventory, create a listing (e.g. for your highest-value unused material), or give a value/CO₂ summary."}
