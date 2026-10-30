"""Train and hold out-test a price model from completed marketplace trades."""
import argparse
import math
from pathlib import Path

import joblib
import pandas as pd
from sklearn.ensemble import GradientBoostingRegressor
from sklearn.metrics import mean_absolute_error, mean_squared_error, r2_score
from sklearn.model_selection import train_test_split

from price import MODEL_PATH, MATS, _baseline_unit_price, features

REQUIRED_COLUMNS = ("material", "condition", "quantity", "demand", "distance", "unit_price")
NUMERIC_COLUMNS = ("quantity", "demand", "distance", "unit_price")
MIN_TRAINING_ROWS = 10


def load_training_data(csv_path):
    data = pd.read_csv(csv_path)
    missing = sorted(set(REQUIRED_COLUMNS) - set(data.columns))
    if missing:
        raise ValueError(f"CSV is missing required columns: {', '.join(missing)}")
    if len(data) < MIN_TRAINING_ROWS:
        raise ValueError(f"Need at least {MIN_TRAINING_ROWS} completed trades; found {len(data)}")

    data = data.loc[:, REQUIRED_COLUMNS].copy()
    data["material"] = data["material"].astype("string").str.strip().str.lower()
    data["condition"] = data["condition"].astype("string").str.strip().str.upper()
    unknown_materials = sorted(set(data["material"].dropna()) - set(MATS))
    if unknown_materials:
        raise ValueError(f"Unsupported material values: {', '.join(unknown_materials)}")
    invalid_conditions = sorted(set(data["condition"].dropna()) - set("ABCD"))
    if invalid_conditions:
        raise ValueError(f"Condition must be one of A, B, C, or D; found: {', '.join(invalid_conditions)}")

    for column in NUMERIC_COLUMNS:
        data[column] = pd.to_numeric(data[column], errors="coerce")
    if data.isna().any().any():
        raise ValueError("CSV contains blank or non-numeric feature/target values")
    if not all(math.isfinite(value) for column in NUMERIC_COLUMNS for value in data[column]):
        raise ValueError("CSV contains non-finite numeric values")
    if (data["quantity"] <= 0).any() or (data["unit_price"] <= 0).any():
        raise ValueError("quantity and unit_price must be greater than zero")
    if ((data["demand"] < 0) | (data["demand"] > 1)).any():
        raise ValueError("demand must be between 0 and 1")
    if (data["distance"] < 0).any():
        raise ValueError("distance cannot be negative")
    return data


def train_price_model(csv_path, output_path=MODEL_PATH):
    data = load_training_data(csv_path)
    train, test = train_test_split(data, test_size=0.2, random_state=42)
    model = GradientBoostingRegressor(random_state=42)

    x_train = [features(row.material, row.condition, row.quantity, row.demand, row.distance)[0]
               for row in train.itertuples(index=False)]
    x_test = [features(row.material, row.condition, row.quantity, row.demand, row.distance)[0]
              for row in test.itertuples(index=False)]
    y_train = train["unit_price"].to_numpy()
    y_test = test["unit_price"].to_numpy()
    model.fit(x_train, y_train)

    predictions = model.predict(x_test)
    baseline = [
        _baseline_unit_price(row.material, row.condition, row.quantity, row.demand, row.distance)
        for row in test.itertuples(index=False)
    ]
    metrics = {
        "train_rows": len(train),
        "test_rows": len(test),
        "model_mae": float(mean_absolute_error(y_test, predictions)),
        "baseline_mae": float(mean_absolute_error(y_test, baseline)),
        "model_rmse": float(mean_squared_error(y_test, predictions) ** 0.5),
        "model_r2": float(r2_score(y_test, predictions)),
    }

    if metrics["model_mae"] < metrics["baseline_mae"]:
        output_path = Path(output_path)
        output_path.parent.mkdir(parents=True, exist_ok=True)
        joblib.dump(model, output_path)
        metrics["saved_to"] = str(output_path)
    else:
        metrics["saved_to"] = None
    return metrics


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("trades_csv", help="CSV of completed trades; unit_price is INR per kg")
    parser.add_argument("--output", default=str(MODEL_PATH), help="Model artifact path (default: ai-service/model.joblib)")
    args = parser.parse_args()

    metrics = train_price_model(args.trades_csv, args.output)
    for key, value in metrics.items():
        print(f"{key}: {value}")
    if metrics["saved_to"] is None:
        print("Model not saved: it did not beat the current heuristic on the held-out trades.")


if __name__ == "__main__":
    main()
