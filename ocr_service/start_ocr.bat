@echo off
cd /d E:\proofeat\ocr_service
python run_ocr_logged.py > ocr_launcher.log 2>&1
echo OCR_EXIT: %ERRORLEVEL% >> ocr_launcher.log
