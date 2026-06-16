import faulthandler, os, sys, traceback
from pathlib import Path

faulthandler.enable()
os.environ["POLARS_SKIP_CPU_CHECK"] = "1"
sys.path.insert(0, str(Path(__file__).resolve().parent))

from train_receipt_detector import train_model, DEFAULT_YAML_PATH

try:
    train_model(
        data_path=DEFAULT_YAML_PATH,
        model="yolov8n.pt",
        epochs=1,
        imgsz=640,
        batch=1,
        project="runs/train",
        name="receipt_detector_dryrun",
    )
except Exception as exc:
    tb = traceback.format_exc()
    with open("train_dryrun_traceback.txt", "w", encoding="utf-8") as f:
        f.write(tb)
    print(tb)
    raise SystemExit(1)
