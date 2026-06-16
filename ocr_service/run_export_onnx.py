import faulthandler, os, sys, traceback
from pathlib import Path
faulthandler.enable()
os.environ["POLARS_SKIP_CPU_CHECK"] = "1"
sys.path.insert(0, str(Path(__file__).resolve().parent))

from train_receipt_detector import train_model, DEFAULT_YAML_PATH, DEFAULT_DATASET_DIR

project = Path("runs/train") / "receipt_detector_manual_onnx"
project.mkdir(parents=True, exist_ok=True)

try:
    train_model(
        data_path=DEFAULT_YAML_PATH,
        model="yolov8n.pt",
        epochs=2,
        imgsz=640,
        batch=1,
        project=str(project.parent),
        name=project.name,
    )
except Exception as e:
    tb = traceback.format_exc()
    with open("train_traceback.txt", "w", encoding="utf-8") as f:
        f.write(tb)
    print("EXCEPTION:\n", tb)

try:
    from ultralytics import YOLO
    latest_run = sorted((project.parent).glob(project.name + "*"))[-1]
    best_pt = latest_run / "weights" / "best.pt"
    if best_pt.exists():
        yolo = YOLO(str(best_pt))
        exported = yolo.export(format="onnx", dynamic=True, simplify=True)
        print("EXPORTED:", exported)
    else:
        print("best.pt not found")
except Exception as e:
    tb = traceback.format_exc()
    with open("export_traceback.txt", "w", encoding="utf-8") as f:
        f.write(tb)
    print("EXPORT EXCEPTION:\n", tb)
