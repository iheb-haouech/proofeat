import argparse
import os
import shutil
from pathlib import Path

DEFAULT_DATASET_DIR = Path(__file__).parent / "dataset"
DEFAULT_YAML_PATH = DEFAULT_DATASET_DIR / "receipt.yaml"
DEFAULT_IMAGES = DEFAULT_DATASET_DIR / "images"
DEFAULT_LABELS = DEFAULT_DATASET_DIR / "labels"

IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".bmp", ".tif", ".tiff"}


def prepare_dataset(backend_uploads: Path, target_dir: Path):
    target_images = target_dir / "images" / "unlabeled"
    target_images.mkdir(parents=True, exist_ok=True)

    if not backend_uploads.exists():
        raise FileNotFoundError(f"Backend uploads folder not found: {backend_uploads}")

    for source_file in backend_uploads.iterdir():
        if source_file.suffix.lower() in IMAGE_EXTENSIONS and source_file.is_file():
            destination = target_images / source_file.name
            if not destination.exists():
                shutil.copy2(source_file, destination)

    print(f"Copied {len(list(target_images.iterdir()))} image(s) to {target_images}")
    print("Next: annotate the images in YOLO format and move them into labels/train or labels/val.")


def write_data_yaml(output_path: Path, train_images: Path, val_images: Path):
    output_path.parent.mkdir(parents=True, exist_ok=True)
    content = f"train: {train_images.as_posix()}\nval: {val_images.as_posix()}\nnc: 1\nnames: ['receipt']\n"
    output_path.write_text(content, encoding="utf-8")
    print(f"Created data yaml at {output_path}")


def train_model(data_path: Path, model: str, epochs: int, imgsz: int, batch: int, project: str, name: str):
    try:
        from ultralytics import YOLO
    except ImportError:
        raise RuntimeError("ultralytics is not installed. Install it with pip install ultralytics")

    if not data_path.exists():
        raise FileNotFoundError(f"Training data config not found: {data_path}")

    yolo = YOLO(model)
    yolo.train(
        data=str(data_path),
        epochs=epochs,
        imgsz=imgsz,
        batch=batch,
        project=project,
        name=name,
    )


def main():
    parser = argparse.ArgumentParser(description="Train or prepare receipt detection data")
    parser.add_argument("--prepare", action="store_true", help="Copy upload images into the dataset folder for annotation")
    parser.add_argument("--backend-uploads", type=Path, default=Path(__file__).parent.parent / "backend" / "uploads", help="Path to backend uploads folder")
    parser.add_argument("--data-dir", type=Path, default=DEFAULT_DATASET_DIR, help="Root dataset directory")
    parser.add_argument("--create-yaml", action="store_true", help="Create a YOLO data yaml file")
    parser.add_argument("--train", action="store_true", help="Train a YOLO receipt detector")
    parser.add_argument("--data-path", type=Path, default=DEFAULT_YAML_PATH, help="Path to YOLO data yaml")
    parser.add_argument("--model", type=str, default="yolov8n.pt", help="Base YOLO model to train from")
    parser.add_argument("--epochs", type=int, default=50, help="Number of training epochs")
    parser.add_argument("--imgsz", type=int, default=640, help="Training image size")
    parser.add_argument("--batch", type=int, default=8, help="Batch size")
    parser.add_argument("--project", type=str, default="runs/train", help="Ultralytics project directory")
    parser.add_argument("--name", type=str, default="receipt_detector", help="Ultralytics run name")
    args = parser.parse_args()

    if args.prepare:
        prepare_dataset(args.backend_uploads, args.data_dir)

    if args.create_yaml:
        train_images = args.data_dir / "images" / "train"
        val_images = args.data_dir / "images" / "val"
        write_data_yaml(args.data_path, train_images, val_images)

    if args.train:
        train_model(args.data_path, args.model, args.epochs, args.imgsz, args.batch, args.project, args.name)

    if not (args.prepare or args.create_yaml or args.train):
        parser.print_help()


if __name__ == "__main__":
    main()
