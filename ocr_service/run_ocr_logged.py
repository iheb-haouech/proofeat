import sys
import os
import traceback
import io
import contextlib

LOG_PATH = os.path.join(os.path.dirname(__file__), "ocr_launcher.log")

def main():
    try:
        os.environ["POLARS_SKIP_CPU_CHECK"] = "1"
        sys.path.insert(0, os.path.dirname(__file__))

        with open(LOG_PATH, "a", encoding="utf-8") as log_f, \
             contextlib.redirect_stdout(log_f), \
             contextlib.redirect_stderr(log_f):
            log_f.write("=== OCR launch ===\n")
            from main import startServer
            startServer()
    except Exception as exc:
        with open(LOG_PATH, "a", encoding="utf-8") as log_f:
            log_f.write("=== LAUNCH EXCEPTION ===\n")
            traceback.print_exc(file=log_f)
        raise

if __name__ == "__main__":
    main()
