from fastapi import FastAPI, UploadFile, File
from fastapi.responses import JSONResponse
import numpy as np
import cv2
import pytesseract
import re

app = FastAPI()

def preprocess_ticket(image_bytes: bytes) -> np.ndarray:
    nparr = np.frombuffer(image_bytes, np.uint8)
    img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)

    # Resize raisonnable
    h, w = img.shape[:2]
    scale = 1200 / max(h, w)
    img = cv2.resize(img, (int(w * scale), int(h * scale)))

    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    gray = cv2.medianBlur(gray, 3)

    # Binarisation adaptative
    bw = cv2.adaptiveThreshold(
        gray, 255,
        cv2.ADAPTIVE_THRESH_GAUSSIAN_C,
        cv2.THRESH_BINARY,
        31, 15
    )

    return bw

def extract_order_number(img: np.ndarray) -> tuple[str | None, str]:
    # OCR global
    full_text = pytesseract.image_to_string(img, lang="eng+fra")

    # OCR ciblé pour le # + caractères
    config = r'--oem 3 --psm 6 -c tessedit_char_whitelist=#0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ'
    text_focus = pytesseract.image_to_string(img, config=config)

    combined = (full_text + "\n" + text_focus)

    # Regex du numéro de commande Uber Eats (# suivi de 4–8 lettres/chiffres)
    m = re.search(r'#\s*[0-9A-Z]{4,8}', combined)
    order = m.group(0).replace(" ", "") if m else None

    return order, combined

@app.get("/health")
async def health():
    return {"ok": True}

@app.post("/extract-order")
async def extract_order(file: UploadFile = File(...)):
    image_bytes = await file.read()
    img = preprocess_ticket(image_bytes)
    order, text = extract_order_number(img)

    if not order:
        return JSONResponse(
            status_code=422,
            content={"message": "Numéro de commande introuvable", "text": text[:2000]},
        )

    # Note : pas de processedPath pour l’instant, on peut l’ajouter plus tard
    return {
        "ticketNumber": order,
        "customerName": None,
        "processedPath": None,
        "text": text[:12000],
    }