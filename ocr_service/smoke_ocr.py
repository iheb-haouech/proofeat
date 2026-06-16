import faulthandler, os, sys, traceback
from pathlib import Path

LOG_PATH = Path(__file__).with_name("ocr_smoke.log")
faulthandler.enable()
os.environ["POLARS_SKIP_CPU_CHECK"] = "1"
sys.path.insert(0, str(Path(__file__).resolve().parent))

try:
    with LOG_PATH.open("a", encoding="utf-8") as log:
        log.write("=== OCR smoke ===\n")
        from main import create_app, startServer
        app = create_app()
        log.write(f"APP_CREATED type={type(app).__name__}\n")
        log.write("Starting server...\n")
        log.flush()
    startServer()
except Exception:
    with LOG_PATH.open("a", encoding="utf-8") as log:
        log.write("=== SMOKE EXCEPTION ===\n")
        traceback.print_exc(file=log)
    traceback.print_exc()
    raise SystemExit(1)
