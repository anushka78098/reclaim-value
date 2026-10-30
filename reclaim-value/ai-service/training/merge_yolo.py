"""Merge several YOLO-format datasets (each with data.yaml) into one unified 6-class dataset.
python merge_yolo.py data/unified data/codd_yolo data/raw/iaac__constrcution-materials data/raw/robocount__steel-construction-materials ...
Unmapped / ambiguous labels are dropped; images left with no labels are skipped. Prints per-class counts."""
import sys, shutil, collections
from pathlib import Path
import yaml
from common import UNIFIED, map_name

out = Path(sys.argv[1]); counts = collections.Counter(); imgs = collections.Counter()
for sp in ("train", "val", "test"):
    (out / sp / "images").mkdir(parents=True, exist_ok=True); (out / sp / "labels").mkdir(parents=True, exist_ok=True)
for srcdir in map(Path, sys.argv[2:]):
    names = yaml.safe_load((srcdir / "data.yaml").read_text())["names"]
    names = list(names.values()) if isinstance(names, dict) else names
    remap = {i: UNIFIED.index(u) for i, n in enumerate(names) if (u := map_name(n)) is not None}
    for sp_src, sp in (("train", "train"), ("valid", "val"), ("val", "val"), ("test", "test")):
        for lab in (srcdir / sp_src / "labels").glob("*.txt") if (srcdir / sp_src / "labels").exists() else []:
            rows = []
            for line in lab.read_text().splitlines():
                p = line.split()
                if p and int(p[0]) in remap: rows.append(" ".join([str(remap[int(p[0])])] + p[1:])); counts[UNIFIED[remap[int(p[0])]]] += 1
            img = next((x for e in (".jpg", ".jpeg", ".png") if (x := (srcdir / sp_src / "images" / (lab.stem + e))).exists()), None)
            if not rows or img is None: continue
            tag = srcdir.name[:20]
            shutil.copy(img, out / sp / "images" / f"{tag}_{img.name}"); (out / sp / "labels" / f"{tag}_{lab.name}").write_text("\n".join(rows)); imgs[sp] += 1
(out / "data.yaml").write_text(yaml.safe_dump({"path": str(out.resolve()), "train": "train/images", "val": "val/images", "test": "test/images", "names": dict(enumerate(UNIFIED))}))
print("images per split:", dict(imgs)); print("boxes per class:", dict(counts))
missing = [u for u in UNIFIED if counts[u] < 300]
if missing: print("WARNING: fewer than 300 boxes for:", missing, "– collect/label more images for these classes (e.g. glass).")
