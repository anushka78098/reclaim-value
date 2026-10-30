"""Shared class mapping: any dataset label -> the 6 unified Reclaim Value classes."""
UNIFIED = ["steel", "concrete", "brick", "wood", "tiles", "glass"]
KEYWORDS = {"steel": ["steel", "rebar", "beam", "metal", "iron"], "concrete": ["concrete"], "brick": ["brick"],
            "wood": ["wood", "timber", "lumber"], "tiles": ["tile"], "glass": ["glass"]}


def map_name(name: str):
    """Return unified class if EXACTLY one matches, else None (drops ambiguous labels like 'brickconcrete')."""
    n = name.lower().replace("_", " ").replace("-", " ")
    hits = {u for u, ks in KEYWORDS.items() if any(k in n for k in ks)}
    return next(iter(hits)) if len(hits) == 1 else None
