import subprocess, sys, os, datetime
from pathlib import Path

ocrDir = Path(__file__).resolve().parent
logFile = ocrDir / f"uvicorn_launch_{datetime.datetime.now().strftime('%Y%m%d_%H%M%S')}.log"

uvicornExe = None
for candidate in [ocrDir / ".venv" / "Scripts" / "uvicorn.exe", Path(r"C:\Users\Administrateur\AppData\Roaming\Python\Python311\Scripts\uvicorn.exe")]:
    if candidate.exists():
        uvicornExe = str(candidate)
        break

cmd = [uvicornExe or "uvicorn", "main:app", "--host", "127.0.0.1", "--port", "8000"]

print(f"[LAUNCHER] launching: {' '.join(cmd)}")
print(f"[LAUNCHER] cwd: {ocrDir}")
print(f"[LAUNCHER] log: {logFile}")

env = os.environ.copy()
env["POLARS_SKIP_CPU_CHECK"] = "1"
env["MENU_XLSX_PATH"] = str(ocrDir / "Grille-tarifaire-Chamas-2.xlsx")

with logFile.open("w", encoding="utf-8") as log:
    log.write(f"CMD: {' '.join(cmd)}\n")
    log.flush()
    proc = subprocess.Popen(
        cmd,
        cwd=str(ocrDir),
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        env=env,
        text=True,
        bufsize=1,
        universal_newlines=True,
    )
    log.write(f"PID: {proc.pid}\n")
    log.flush()
    for line in proc.stdout:
        log.write(line)
        log.flush()
    proc.wait()
    log.write(f"EXIT_CODE: {proc.returncode}\n")
    log.flush()

print(f"[LAUNCHER] uvicorn exited with code {proc.returncode}")
