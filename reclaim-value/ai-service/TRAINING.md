# Training the Reclaim Value models on real data

## 1. Data sources (all links checked on 29 Oct 2026; re-check licences before use)

### Material detection (steel / concrete / brick / wood / tiles / glass)
| Dataset | What it gives you | Link | Licence |
|---|---|---|---|
| **CODD** – Construction & Demolition Waste Object Detection | 3,129 images, 16,545 boxes, 10 classes incl. bricks, concrete, tiles, wood. Real recycling-facility photos, VOC XML | https://data.mendeley.com/datasets/wds85kt64j/3 (paper: https://defeat.frederick.ac.cy/docs/CODD_A_benchmark_dataset_for_the_automated_sorting_of_CDW.pdf) | see dataset page |
| Earlier Cyprus CDW set | 550 images, concrete/brick/tile, includes stacked "hard" test set | https://data.mendeley.com/datasets/24d45pf8wm/2 | see dataset page |
| Roboflow: IAAC construction-materials | 427 images: wood, brick, concrete | https://universe.roboflow.com/iaac/constrcution-materials | see page |
| Roboflow: CD_OBB | brick, concrete, rubber, wood | https://universe.roboflow.com/enzo-guo-jfodj/cd_obb | see page |
| Roboflow: Steel Construction Materials | steel construction items (pipes, etc.) | https://universe.roboflow.com/robocount/steel-construction-materials | CC BY 4.0 |
| Roboflow: Material_Database | rebar, concrete, formwork | https://universe.roboflow.com/conapi/material_database-i52bc | see page |
| Roboflow: construction waste | brick / brick-concrete | https://universe.roboflow.com/josiahs-project/construction-waste-fx7td | see page |
| Hong Kong CDW segmentation benchmark (Sci. Data 2025) | skip-bin images from real sites, class-wise masks | https://hub.hku.hk/handle/10722/371361 (find the data link in the paper) | see paper |
| Survey of all CDW vision datasets | Table of 27 papers + datasets (incl. ZeroWaste) | https://arxiv.org/pdf/2409.13112 | – |

### Condition grading (rust / corrosion for steel)
| Dataset | Link | Licence |
|---|---|---|
| Rust Detection (4,106 images, low/medium/high corrosion) – **recommended** | https://universe.roboflow.com/zenil/rust-detection-4cr1b | see page |
| Thyssenkrupp Corrosion (Fair / Poor / Severe) | https://universe.roboflow.com/thyssenkrupp/corrosion-whmsc | see page |
| Rust Corrosion Detection | https://universe.roboflow.com/mavromati/rust-corrosion-detection-rd8mo | CC BY 4.0 |
| severe_rust_corrosion_door | https://universe.roboflow.com/cdd/severe_rust_corrosion_door_zoom_out_2 | CC BY 4.0 |
| How-to guide | https://blog.roboflow.com/corrosion-detection/ | – |

### Prices (steel, India)
- Ministry of Steel / Joint Plant Committee (JPC) publish average retail prices of TMT, plates, HR/CR coils, and monthly "Overview of Steel Sector" reports: https://steel.gov.in (search "An Overview of Steel Sector") and https://jpcindiansteel.nic.in (trend reports).
  Example of the data format (parliament replies): https://steel.gov.in/sites/default/files/2025-04/lu3947.pdf
- These are **new-steel** prices. Use them to calibrate `BASE_PRICE` in `recommend.py`, not as salvage prices.

## 2. Gaps you must fill yourself (no public data exists)
1. **Salvage grades A–D.** No open dataset labels reused building materials by resale grade. The corrosion models give you a defensible *steel* grade; for timber/brick/tiles, label 300–500 of your own site photos per class (Roboflow, CVAT or Label Studio) with agreed rules (e.g. A = no visible damage, D = structurally unsafe).
2. **Glass and clean steel sections (I-beams)** are thin in the sets above. The merge script warns when a class has <300 boxes.
3. **Salvage trade prices.** The only real source is your own marketplace's completed transactions. Until you have a few hundred, keep the baseline formula; then train (step 5).
4. **Quantity (kg).** Photos do not give weight. Treat the AI value as a prompt and let sellers confirm weight.

## 3. Setup
```bash
cd ai-service/training && pip install -r requirements.txt
export ROBOFLOW_API_KEY=...        # free key from roboflow.com
```

## 4. Train the material detector
```bash
# a) Download CODD manually from Mendeley (unzip to data/codd), then convert
python prepare_codd.py data/codd data/codd_yolo          # prints labels found vs. kept

# b) Roboflow sets (open each page, confirm the version number)
python download_roboflow.py data/raw iaac/constrcution-materials:2 enzo-guo-jfodj/cd_obb:1 robocount/steel-construction-materials:1 conapi/material_database-i52bc:1

# c) Merge into the 6 unified classes (ambiguous labels such as "brickconcrete" are dropped)
python merge_yolo.py data/unified data/codd_yolo data/raw/*

# d) Balanced Colab run: pretrained small model, 640px, max 50 epochs,
#    early stop after 10 epochs without validation improvement
python train_yolo.py data/unified/data.yaml materials --model yolov8s.pt --epochs 50 --imgsz 640 --batch 16 --patience 10
```
The best checkpoint is selected using the validation split during training; the script then evaluates it on the separate test split. Check the printed per-class mAP. This shorter run is a practical starting point, not an accuracy guarantee. If the T4 GPU runs out of memory, retry with `--batch 8`; if it still runs out, use `--batch 4`. Avoid reducing image size first if detecting small material pieces matters.

## 5. Train the condition (corrosion) model
```bash
python download_roboflow.py data/raw zenil/rust-detection-4cr1b:1
python train_yolo.py data/raw/zenil__rust-detection-4cr1b/data.yaml condition   # -> ../weights/condition.pt
```
`vision.py` converts weighted corroded-area fraction into grade A–D.

## 5a. Use a larger model and fine-tune on your own site photos
The default uses `yolov8s.pt` at 640 pixels, up to 50 epochs, and stops early after 10 epochs without validation improvement. This is faster than a medium model at 960 pixels for 150 epochs, while retaining pretrained weights, validation-based checkpoint selection, and a separate test evaluation. A larger model can help, but adding representative, correctly labeled photos is usually more important than model size. For a Colab GPU with enough memory and time, try:
```bash
python train_yolo.py data/unified/data.yaml materials --model yolov8m.pt --epochs 150 --imgsz 960 --batch 8 --patience 30
```
If CUDA reports out-of-memory, reduce `--batch` to `4`, then reduce `--imgsz` to `640`. If `yolov8m.pt` is still too large, use `yolov8s.pt`. Keep the test split untouched while labeling and training; use only the test split for final evaluation. Add phone photos from the sites where the model will be used, with bounding boxes and the same six class names. Check `data.yaml` to confirm class IDs map to `steel, concrete, brick, wood, tiles, glass` in that order. Avoid making near-duplicate photos of the same scene appear in both train and test splits.

## 6. Price model
```bash
python export_trades.py mongodb://127.0.0.1:27017/reclaim_value trades.csv   # real completed trades
cd .. && python train_price.py training/trades.csv                            # evaluates a holdout; saves only if it beats the heuristic
```
The CSV must contain `material,condition,quantity,demand,distance,unit_price`; `unit_price` is the accepted trade's INR per kg. The trainer checks values, uses a fixed 80/20 holdout, and reports MAE, RMSE, and R² alongside the current heuristic's holdout MAE. It writes `model.joblib` only when the model has lower MAE than that baseline. A saved model predicts the realized per-kg price directly; it does not apply the heuristic's bulk/distance discounts a second time.

The holdout is a first check, not production certification. The current export has no site or time split, so it may overstate performance on new locations or future market conditions. Keep a separate set of newer trades and sites for a final evaluation, and compare errors by material and condition before deployment. Do not train on `seed_synthetic_trades.py` output for production; it only tests the pipeline.

## 7. Run with the trained models
```bash
cd ai-service
YOLO_WEIGHTS=weights/materials.pt CONDITION_WEIGHTS=weights/condition.pt uvicorn main:app --port 8000
```
Responses then report `demo_mode: false`.

## 8. Evaluate honestly
Hold out whole **sites/sources**, not random images, so you measure generalisation to new yards. Test on phone photos from real Indian sites, because CODD is from Cyprus conveyor belts and domain shift is large. Fine-tune on 200+ of your own photos before trusting accuracy numbers in your report.
