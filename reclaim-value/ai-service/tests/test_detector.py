import sys
from pathlib import Path
from types import SimpleNamespace

import numpy as np
import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import detector


class FakeBox:
    def __init__(self, class_id, confidence, coordinates):
        self.cls = np.array(class_id)
        self.conf = np.array(confidence)
        self.xyxy = np.array([coordinates], dtype=float)


class FakeModel:
    def __init__(self, boxes, names):
        self.boxes = boxes
        self.names = names

    def predict(self, image_path, conf, verbose):
        return [SimpleNamespace(boxes=self.boxes, names=self.names)]


@pytest.fixture
def image_path(tmp_path):
    image = tmp_path / "material.jpg"
    image.write_bytes(b"test image")
    return str(image)


def test_aggregates_detection_area_by_material(monkeypatch, image_path):
    model = FakeModel(
        [
            FakeBox(0, 0.9, [0, 0, 10, 10]),
            FakeBox(1, 0.8, [0, 0, 20, 20]),
            FakeBox(1, 0.7, [20, 0, 30, 10]),
        ],
        {0: "steel", 1: "brick"},
    )
    monkeypatch.setattr(detector, "MODEL", model)

    result = detector.detect_material(image_path)

    assert result == {
        "material": "brick",
        "confidence": 0.75,
        "share": {"steel": 0.17, "brick": 0.83},
        "detections": 3,
    }


def test_filters_low_confidence_steel_before_aggregation(monkeypatch, image_path):
    model = FakeModel(
        [
            FakeBox(0, 0.49, [0, 0, 100, 100]),
            FakeBox(1, 0.4, [0, 0, 10, 10]),
        ],
        {0: "steel", 1: "brick"},
    )
    monkeypatch.setattr(detector, "MODEL", model)

    result = detector.detect_material(image_path)

    assert result == {
        "material": "brick",
        "confidence": 0.4,
        "share": {"brick": 1.0},
        "detections": 1,
    }


def test_returns_none_when_no_detections_pass_filters(monkeypatch, image_path):
    model = FakeModel([FakeBox(0, 0.49, [0, 0, 10, 10])], {0: "steel"})
    monkeypatch.setattr(detector, "MODEL", model)

    assert detector.detect_material(image_path) is None


def test_rejects_invalid_confidence_threshold(image_path):
    with pytest.raises(ValueError, match="between 0 and 1"):
        detector.detect_material(image_path, conf=1.1)


def test_rejects_missing_image_file(tmp_path):
    with pytest.raises(FileNotFoundError, match="Image file"):
        detector.detect_material(str(tmp_path / "missing.jpg"))
