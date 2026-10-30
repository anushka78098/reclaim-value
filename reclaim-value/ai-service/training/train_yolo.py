"""Fine-tune YOLO and evaluate on the dataset test split."""
import argparse
import shutil
from pathlib import Path

from ultralytics import YOLO


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("data", help="Path to a YOLO data.yaml file")
    parser.add_argument("name", help="Name used for the run and output weights file")
    parser.add_argument("--model", default="yolov8s.pt", help="Pretrained model checkpoint (default: yolov8s.pt)")
    parser.add_argument("--epochs", type=int, default=50)
    parser.add_argument("--imgsz", type=int, default=640)
    parser.add_argument("--batch", type=int, default=16)
    parser.add_argument("--patience", type=int, default=10)
    args = parser.parse_args()
    if min(args.epochs, args.imgsz, args.batch, args.patience) < 1:
        parser.error("--epochs, --imgsz, --batch, and --patience must be positive integers")

    model = YOLO(args.model)
    model.train(data=args.data, epochs=args.epochs, imgsz=args.imgsz, batch=args.batch,
                patience=args.patience, project="runs", name=args.name, hsv_h=0.015,
                hsv_s=0.6, hsv_v=0.4, degrees=10, fliplr=0.5, mosaic=1.0)
    metrics = model.val(data=args.data, split="test")
    print(f"mAP50={metrics.box.map50:.3f} mAP50-95={metrics.box.map:.3f}")
    print("per-class mAP50-95:", dict(zip(
        metrics.names.values(), [round(float(score), 3) for score in metrics.box.maps]
    )))
    output_dir = Path("../weights")
    output_dir.mkdir(exist_ok=True)
    destination = output_dir / f"{args.name}.pt"
    shutil.copy(Path(model.trainer.save_dir) / "weights" / "best.pt", destination)
    print(f"Saved best weights to {destination.resolve()}")


if __name__ == "__main__":
    main()
