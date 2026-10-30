import sys, os; sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))
from io import BytesIO
import pandas as pd
from PIL import Image
import price
import vision
from recommend import recommend
from price import predict_price
from nlp import parse_query, agent_intent
from train_price import train_price_model, load_training_data

def test_steel_sell_with_high_demand():
    r = recommend("steel", "B", 1200, demand_index=0.9, distance_km=8)
    assert r["action"] == "Sell" and r["avoided_co2_tons"] == 1.8

def test_poor_condition_not_sold():
    assert recommend("wood", "D", 100, demand_index=0.1, distance_km=45, storage_days=170)["action"] in ("Recycle", "Dispose")

def test_price_within_range():
    p = predict_price("steel", "C", 500)
    assert p["range"][0] < p["total_price"] < p["range"][1]

def test_model_status_explains_unconfigured_weights(monkeypatch):
    monkeypatch.setattr(vision, "WEIGHTS", None)
    monkeypatch.setattr(vision, "_yolo", None)
    monkeypatch.setattr(vision, "_yolo_load_error", "YOLO_WEIGHTS is not set")

    status = vision.model_status()["material_model"]

    assert status == {
        "loaded": False,
        "weights_configured": False,
        "weights_file_found": False,
        "error": "YOLO_WEIGHTS is not set",
    }

def test_loaded_model_no_detection_is_reported_separately(monkeypatch):
    class EmptyBoxes:
        def __len__(self):
            return 0

    class Result:
        boxes = EmptyBoxes()

    class NoDetectionModel:
        def __call__(self, image, verbose=False):
            return [Result()]

    monkeypatch.setattr(vision, "_yolo", NoDetectionModel())
    monkeypatch.setattr(vision, "_yolo_load_error", None)
    monkeypatch.setattr(vision, "condition_from_image", lambda image: ("A", 0.9, 0.0))
    image = BytesIO()
    Image.new("RGB", (16, 16)).save(image, format="PNG")

    detection = vision.analyze(image.getvalue())

    assert detection["demo_mode"] is True
    assert detection["model_loaded"] is True
    assert detection["fallback_reason"] == "Model loaded but detected no objects in this image"

def test_trained_price_prediction_does_not_apply_heuristic_discount_twice(monkeypatch):
    class FixedModel:
        def predict(self, rows):
            return [10.0]

    monkeypatch.setattr(price, "_model", FixedModel())
    prediction = predict_price("steel", "A", 10000, distance_km=50)
    assert prediction["unit_price"] == 10.0
    assert prediction["total_price"] == 100000.0

def test_price_training_reports_held_out_metrics(tmp_path):
    rows = []
    for i in range(50):
        rows.append({
            "material": ("steel", "concrete", "brick")[i % 3],
            "condition": "ABCD"[i % 4],
            "quantity": 100 + i * 25,
            "demand": (i % 10) / 10,
            "distance": i % 20,
            "unit_price": 5 + (i % 7) * 4 + i * 0.1,
        })
    csv_path = tmp_path / "trades.csv"
    pd.DataFrame(rows).to_csv(csv_path, index=False)

    metrics = train_price_model(csv_path, tmp_path / "model.joblib")

    assert metrics["train_rows"] == 40
    assert metrics["test_rows"] == 10
    assert metrics["model_mae"] >= 0
    assert metrics["baseline_mae"] >= 0
    assert metrics["model_rmse"] >= 0
    assert (tmp_path / "model.joblib").exists() == (metrics["saved_to"] is not None)

def test_price_training_rejects_unusable_trades(tmp_path):
    csv_path = tmp_path / "trades.csv"
    pd.DataFrame([{
        "material": "unknown",
        "condition": "A",
        "quantity": 100,
        "demand": 0.5,
        "distance": 10,
        "unit_price": 20,
    }] * 10).to_csv(csv_path, index=False)

    try:
        load_training_data(csv_path)
    except ValueError as exc:
        assert "Unsupported material" in str(exc)
    else:
        raise AssertionError("Invalid material data should be rejected")

def test_parse_query():
    f = parse_query("Find good quality steel under ₹30,000 near me")
    assert f["material"] == "steel" and f["price"] == {"$lte": 30000} and f["condition"]["$in"] == ["Grade A", "Grade B"]

def test_agent_tool_call():
    assert agent_intent("Create a listing for my highest-value unused material")["tool"] == "create_listing"

def test_agent_does_not_treat_product_name_as_inventory_summary():
    assert agent_intent("What does Reclaim Value do?")["tool"] is None

def test_agent_still_recognizes_inventory_value_summary():
    assert agent_intent("What is my total inventory value?")["tool"] == "get_summary"
