from fastapi import FastAPI, UploadFile, File
from fastapi.responses import JSONResponse
import numpy as np
import cv2
import os
import re
from datetime import datetime
from menu_matcher import MenuMatcher, build_order_result
from receipt_detector import ReceiptDetector
from ai_parser import AiParser
import pytesseract
pytesseract.pytesseract.tesseract_cmd = r"C:\Program Files\Tesseract-OCR\tesseract.exe"

try:
    from paddleocr import PaddleOCR
    PADDLE_AVAILABLE = True
except ImportError:
    PADDLE_AVAILABLE = False

try:
    from PIL import Image
    import pytesseract
    TESSERACT_AVAILABLE = True
except ImportError:
    TESSERACT_AVAILABLE = False

app = FastAPI()

MENU_XLSX_PATH = os.environ.get("MENU_XLSX_PATH") or os.path.join(os.path.dirname(__file__), "Grille-tarifaire-Chamas-2.xlsx")
DEBUG_DIR = os.environ.get("OCR_DEBUG_DIR") or os.path.join(os.path.dirname(__file__), "debug")
os.makedirs(DEBUG_DIR, exist_ok=True)

try:
    menu_matcher = MenuMatcher(MENU_XLSX_PATH)
except Exception as err:
    print(f"[OCR] failed to load menu catalog at {MENU_XLSX_PATH}: {err}")
    menu_matcher = None

receipt_detector = ReceiptDetector()
ai_parser = AiParser()

ocr = None
if PADDLE_AVAILABLE:
    try:
        ocr = PaddleOCR(
            lang="fr",
            use_doc_orientation_classify=False,
            use_doc_unwarping=False,
            use_textline_orientation=False
        )
    except Exception as e:
        print("[OCR] PaddleOCR init failed:", e)
        ocr = None


def decode_image(image_bytes: bytes):
    arr = np.frombuffer(image_bytes, np.uint8)
    img = cv2.imdecode(arr, cv2.IMREAD_COLOR)
    if img is None:
        raise ValueError("Invalid image")
    return img

def resize_if_needed(img, max_side=1400):
    h, w = img.shape[:2]
    m = max(h, w)
    if m > max_side:
        s = max_side / m
        img = cv2.resize(img, (int(w * s), int(h * s)))
    return img

def order_points(pts):
    rect = np.zeros((4, 2), dtype="float32")
    s = pts.sum(axis=1)
    rect[0] = pts[np.argmin(s)]
    rect[2] = pts[np.argmax(s)]
    d = np.diff(pts, axis=1)
    rect[1] = pts[np.argmin(d)]
    rect[3] = pts[np.argmax(d)]
    return rect

def four_point_transform(image, pts):
    rect = order_points(pts)
    tl, tr, br, bl = rect

    width_a = np.linalg.norm(br - bl)
    width_b = np.linalg.norm(tr - tl)
    height_a = np.linalg.norm(tr - br)
    height_b = np.linalg.norm(tl - bl)

    max_width = int(max(width_a, width_b))
    max_height = int(max(height_a, height_b))

    dst = np.array([
        [0, 0],
        [max_width - 1, 0],
        [max_width - 1, max_height - 1],
        [0, max_height - 1]
    ], dtype="float32")

    M = cv2.getPerspectiveTransform(rect, dst)
    return cv2.warpPerspective(image, M, (max_width, max_height))

def find_receipt_contour(img):
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    blur = cv2.GaussianBlur(gray, (5, 5), 0)
    thresh = cv2.adaptiveThreshold(blur, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C, cv2.THRESH_BINARY, 15, 11)
    kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (9, 9))
    closed = cv2.morphologyEx(thresh, cv2.MORPH_CLOSE, kernel)

    contours, _ = cv2.findContours(closed, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    contours = sorted(contours, key=cv2.contourArea, reverse=True)[:40]

    h, w = gray.shape[:2]
    img_area = h * w
    best = None
    best_area = 0

    for c in contours:
        area = cv2.contourArea(c)
        if area < img_area * 0.005:
            continue

        peri = cv2.arcLength(c, True)
        approx = cv2.approxPolyDP(c, 0.02 * peri, True)

        if len(approx) == 4 and area > best_area:
            best = approx.reshape(4, 2)
            best_area = area

    if best is not None:
        return best

    # fallback: use the largest contour as a bounding box when a 4-point shape cannot be found
    for c in contours:
        area = cv2.contourArea(c)
        if area < img_area * 0.02:
            continue

        x, y, cw, ch = cv2.boundingRect(c)
        if cw * ch > best_area:
            best_area = cw * ch
            best = np.array([[x, y], [x + cw, y], [x + cw, y + ch], [x, y + ch]], dtype="float32")

    return best


def deskew_image(img):
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    blur = cv2.GaussianBlur(gray, (5, 5), 0)
    thresh = cv2.adaptiveThreshold(blur, 255, cv2.ADAPTIVE_THRESH_MEAN_C, cv2.THRESH_BINARY_INV, 15, 9)
    coords = np.column_stack(np.where(thresh > 0))
    if coords.size == 0:
        return img

    angle = cv2.minAreaRect(coords)[-1]
    if angle < -45:
        angle = -(90 + angle)
    else:
        angle = -angle

    h, w = img.shape[:2]
    M = cv2.getRotationMatrix2D((w / 2, h / 2), angle, 1.0)
    return cv2.warpAffine(img, M, (w, h), flags=cv2.INTER_CUBIC, borderMode=cv2.BORDER_REPLICATE)


def preprocess_receipt(img):
    img = resize_if_needed(img, max_side=1400)
    img = deskew_image(img)
    # img = cv2.resize(img, None, fx=2.0, fy=2.0, interpolation=cv2.INTER_CUBIC)
    img = cv2.bilateralFilter(img, 7, 50, 50)
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    clahe = cv2.createCLAHE(clipLimit=3.0, tileGridSize=(8, 8))
    img = clahe.apply(gray)
    img = cv2.cvtColor(img, cv2.COLOR_GRAY2BGR)
    return img


def ensure_three_channels(img):
    if img is None:
        return None
    if len(img.shape) == 2:
        img = cv2.cvtColor(img, cv2.COLOR_GRAY2BGR)
    elif img.shape[2] == 4:
        img = cv2.cvtColor(img, cv2.COLOR_BGRA2BGR)
    elif img.shape[2] == 3:
        img = img
    return img

def tesseract_lines(image):
    if not TESSERACT_AVAILABLE:
        return []

    image_rgb = cv2.cvtColor(image, cv2.COLOR_BGR2RGB) if image.ndim == 3 and image.shape[2] == 3 else image
    pil = Image.fromarray(image_rgb)

    try:
        raw_text = pytesseract.image_to_string(pil, lang='fra+eng')
    except Exception as e:
        print(f"[OCR] Tesseract failed: {e}")
        return []

    lines = []
    for row in raw_text.splitlines():
        text = row.strip()
        if not text:
            continue
        lines.append({"text": text, "score": 0.5, "box": None})
    return lines


def paddle_lines(image):
    return tesseract_lines(image)

def normalize_text(text):
    return re.sub(r'\s+', ' ', str(text or '')).strip()


def extract_ticket_number(lines):
    candidates = []
    for line_obj in lines:
        raw = str(line_obj.get('text', '') or '')
        if not raw.strip():
            continue

        compact = re.sub(r'[^A-Z0-9#]', '', raw.upper())
        for code in re.findall(r'#[A-Z0-9]{3,8}', compact):
            if code not in candidates:
                candidates.append(code)

        for code in re.findall(r'#\s*([A-Z0-9]{3,8})', raw, flags=re.I):
            normalized = f"#{code.upper()}"
            if normalized not in candidates:
                candidates.append(normalized)

    if candidates:
        return candidates[0]

    full_text = ' '.join([x['text'] for x in lines if x.get('text')])
    fallback = re.search(r'#\s*([A-Z0-9]{3,8})', full_text, flags=re.I)
    if fallback:
        return f"#{fallback.group(1).upper()}"

    return None


def extract_customer_name(lines):
    texts = [x["text"] for x in lines]

    for i, t in enumerate(texts):
        low = t.lower()
        if "client" in low:
            for j in range(i, min(i + 3, len(texts))):
                candidate = texts[j].strip()
                if re.search(r'[A-Za-zÀ-ÿ]', candidate) and not re.search(r'(téléphone|code|paiement|commande)', candidate, re.I):
                    candidate = re.sub(r'^(client\s*:?\s*)', '', candidate, flags=re.I).strip()
                    if 3 <= len(candidate) <= 40:
                        return candidate

    header_candidates = texts[:12]
    for t in header_candidates:
        if re.match(r'^[A-Za-zÀ-ÿ][A-Za-zÀ-ÿ .\'-]{2,40}$', t) and "uber" not in t.lower():
            if not re.search(r'(commande|préparer|client|téléphone|paiement)', t, re.I):
                return t.strip()

    return None

def extract_total(texts):
    joined = "\n".join(texts)
    m = re.search(r'Total[:\s]*([0-9]+[.,][0-9]{2})', joined, re.I)
    if m:
        return float(m.group(1).replace(",", "."))
    amounts = re.findall(r'([0-9]+[.,][0-9]{2})\s*€?', joined)
    if amounts:
        return float(amounts[-1].replace(",", "."))
    return None

@app.get("/health")
async def health():
    return {"ok": True}

@app.get("/model-health")
async def model_health():
    detector_ready = receipt_detector.model_type is not None
    model_status = ai_parser.is_ready()
    return {
        "ocr_detector": {
            "enabled": detector_ready,
            "model_type": receipt_detector.model_type,
            "model_path": receipt_detector.model_path,
        },
        "ai_parser": model_status,
    }

@app.post("/extract-order")
async def extract_order(file: UploadFile = File(...)):
    import time
    start_time = time.time()
    try:
        contents = await file.read()
        read_time = time.time()
        print(f"[OCR] File read in {(read_time - start_time):.2f}s")

        img = decode_image(contents)
        decode_time = time.time()
        print(f"[OCR] Image decoded in {(decode_time - read_time):.2f}s")

        img = resize_if_needed(img, max_side=1400)
        resize_time = time.time()
        print(f"[OCR] Image resized in {(resize_time - decode_time):.2f}s")

        receipt_box = None
        receipt = img
        detect_time = time.time()
        print(f"[OCR] Detection skipped in {(detect_time - resize_time):.2f}s")

        gray = cv2.cvtColor(receipt, cv2.COLOR_BGR2GRAY)
        receipt = cv2.cvtColor(gray, cv2.COLOR_GRAY2BGR)
        preprocess_time = time.time()
        print(f"[OCR] Light preprocess in {(preprocess_time - detect_time):.2f}s")
        print(f"[OCR] Image preprocessed in {(preprocess_time - detect_time):.2f}s")

        line_objs = paddle_lines(receipt)
        ocr_time = time.time()
        print(f"[OCR] Paddle OCR completed in {(ocr_time - preprocess_time):.2f}s, lines={len(line_objs)}")

        texts = [x["text"] for x in line_objs]
        print(f"[OCR] extracted {len(texts)} OCR lines, receipt box={'yes' if receipt_box is not None else 'no'}")

        ticket_number = extract_ticket_number(line_objs)
        customer_name = extract_customer_name(line_objs)
        total_amount = extract_total(texts)

        if menu_matcher is not None:
            baseline = build_order_result(texts, menu_matcher)
        else:
            baseline = {
                "ticketNumber": None,
                "customerName": None,
                "processedPath": None,
                "text": "\n".join(texts),
                "parsedData": {
                    "phoneNumber": None,
                    "ticketDate": None,
                    "totalAmount": total_amount,
                    "items": [],
                },
            }

        result = baseline

        if "parsedData" not in result or result["parsedData"] is None:
            result["parsedData"] = {}

        result["ticketNumber"] = ticket_number or result.get("ticketNumber")
        result["customerName"] = customer_name or result.get("customerName")
        result["parsedData"]["totalAmount"] = result["parsedData"].get("totalAmount") or total_amount
        result["text"] = "\n".join(texts)
        result["headerText"] = "\n".join(texts[:10])

        ts = datetime.now().strftime("%Y%m%d_%H%M%S_%f")
        receipt_path = os.path.join(DEBUG_DIR, f"{ts}_receipt.jpg")
        cv2.imwrite(receipt_path, receipt)
        result["processedPath"] = receipt_path

        end_time = time.time()
        print(f"[OCR] Total request time: {(end_time - start_time):.2f}s")
        print(f"[OCR RESULT] ticket={result.get('ticketNumber')}, items={len(result.get('parsedData', {}).get('items', []))}")

        return JSONResponse(content=result)

    except Exception as e:
        print(f"[OCR] Exception: {e}")
        raise