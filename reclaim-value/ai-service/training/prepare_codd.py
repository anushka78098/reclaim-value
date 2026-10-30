"""Convert CODD (Pascal VOC XML) -> YOLO txt using the unified classes.
Usage: python prepare_codd.py <codd_dir> <out_dir>
Prints every class name found so you can extend KEYWORDS in common.py if something is dropped."""
import sys, random, shutil, collections, xml.etree.ElementTree as ET
from pathlib import Path
import yaml
from common import UNIFIED, map_name

src, out = Path(sys.argv[1]), Path(sys.argv[2]); random.seed(0)
seen, kept = collections.Counter(), collections.Counter()
for sp in ("train", "val", "test"):
    (out / sp / "images").mkdir(parents=True, exist_ok=True); (out / sp / "labels").mkdir(parents=True, exist_ok=True)
for xml in src.rglob("*.xml"):
    img = next((p for e in (".jpg", ".jpeg", ".png", ".JPG") if (p := xml.with_suffix(e)).exists()), None)
    if img is None: continue
    root = ET.parse(xml).getroot(); W = float(root.findtext("size/width")); H = float(root.findtext("size/height")); lines = []
    for o in root.findall("object"):
        name = o.findtext("name"); seen[name] += 1; u = map_name(name)
        if u is None: continue
        b = o.find("bndbox"); x1, y1, x2, y2 = (float(b.findtext(k)) for k in ("xmin", "ymin", "xmax", "ymax"))
        lines.append(f"{UNIFIED.index(u)} {(x1+x2)/2/W:.6f} {(y1+y2)/2/H:.6f} {(x2-x1)/W:.6f} {(y2-y1)/H:.6f}"); kept[u] += 1
    if not lines: continue
    parts = [p.lower() for p in xml.parts]
    sp = "train" if "train" in parts else "test" if "test" in parts else "val" if ("val" in parts or "valid" in parts) else random.choices(["train", "val", "test"], [.8, .1, .1])[0]
    shutil.copy(img, out / sp / "images" / img.name); (out / sp / "labels" / f"{img.stem}.txt").write_text("\n".join(lines))
(out / "data.yaml").write_text(yaml.safe_dump({"path": str(out.resolve()), "train": "train/images", "val": "val/images", "test": "test/images", "names": dict(enumerate(UNIFIED))}))
print("labels found in source:", dict(seen)); print("kept as unified classes:", dict(kept))
