import csv
import hashlib
import random
import shutil
from pathlib import Path

import cv2

BASE_DIR = Path(__file__).resolve().parent
RAW_DIR = BASE_DIR / "raw_images"
DATASET_DIR = BASE_DIR / "dataset"
TRAIN_RATIO = 0.8
RANDOM_SEED = 42
IMAGE_EXTS = {".jpg", ".jpeg", ".png", ".bmp", ".webp", ".tif", ".tiff"}

IMAGES_TRAIN = DATASET_DIR / "images" / "train"
IMAGES_VAL = DATASET_DIR / "images" / "val"
IMAGES_REVIEW = DATASET_DIR / "images" / "needs_review"

LABELS_TRAIN = DATASET_DIR / "labels" / "train"
LABELS_VAL = DATASET_DIR / "labels" / "val"

PREVIEWS_TRAIN = DATASET_DIR / "previews" / "train"
PREVIEWS_VAL = DATASET_DIR / "previews" / "val"

REPORTS_DIR = DATASET_DIR / "reports"
REPORT_CSV = REPORTS_DIR / "prepare_dataset_report.csv"
APPEND_REPORT_CSV = REPORTS_DIR / "prepare_dataset_append_report.csv"


def ensure_dirs():
    for p in [
        RAW_DIR,
        IMAGES_TRAIN, IMAGES_VAL, IMAGES_REVIEW,
        LABELS_TRAIN, LABELS_VAL,
        PREVIEWS_TRAIN, PREVIEWS_VAL,
        REPORTS_DIR,
    ]:
        p.mkdir(parents=True, exist_ok=True)


def normalize_box(x1, y1, x2, y2, w, h):
    xc = ((x1 + x2) / 2) / w
    yc = ((y1 + y2) / 2) / h
    bw = (x2 - x1) / w
    bh = (y2 - y1) / h
    return xc, yc, bw, bh


def to_yolo_line(box, w, h):
    x1, y1, x2, y2 = box
    xc, yc, bw, bh = normalize_box(x1, y1, x2, y2, w, h)
    return f"0 {xc:.6f} {yc:.6f} {bw:.6f} {bh:.6f}"


def clamp_box(x1, y1, x2, y2, w, h):
    x1 = max(0, min(int(x1), w - 1))
    y1 = max(0, min(int(y1), h - 1))
    x2 = max(0, min(int(x2), w - 1))
    y2 = max(0, min(int(y2), h - 1))
    return x1, y1, x2, y2


def is_reasonable_receipt_box(box, w, h):
    x1, y1, x2, y2 = box
    bw = x2 - x1
    bh = y2 - y1
    area = bw * bh
    img_area = w * h
    ratio = bh / max(bw, 1)

    if bw < 40 or bh < 80:
        return False
    if area < img_area * 0.01:
        return False
    if area > img_area * 0.7:
        return False
    if ratio < 1.2:
        return False
    return True


def detect_receipt_box(img):
    h, w = img.shape[:2]
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    blur = cv2.GaussianBlur(gray, (5, 5), 0)

    candidates = []

    th1 = cv2.adaptiveThreshold(
        blur, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C,
        cv2.THRESH_BINARY, 31, 15
    )
    th1 = 255 - th1

    kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (5, 5))
    th1 = cv2.morphologyEx(th1, cv2.MORPH_CLOSE, kernel, iterations=2)

    edges = cv2.Canny(blur, 60, 180)

    for binary in [th1, edges]:
        contours, _ = cv2.findContours(binary, cv2.RETR_LIST, cv2.CHAIN_APPROX_SIMPLE)
        contours = sorted(contours, key=cv2.contourArea, reverse=True)[:80]

        for c in contours:
            area = cv2.contourArea(c)
            if area < w * h * 0.01:
                continue

            x, y, bw, bh = cv2.boundingRect(c)
            box = clamp_box(x, y, x + bw, y + bh, w, h)
            if is_reasonable_receipt_box(box, w, h):
                candidates.append((area, box))

            peri = cv2.arcLength(c, True)
            approx = cv2.approxPolyDP(c, 0.02 * peri, True)
            if len(approx) == 4:
                x, y, bw, bh = cv2.boundingRect(approx)
                box = clamp_box(x, y, x + bw, y + bh, w, h)
                if is_reasonable_receipt_box(box, w, h):
                    candidates.append((area * 1.1, box))

    if not candidates:
        return None

    candidates.sort(key=lambda x: x[0], reverse=True)
    return candidates[0][1]


def save_preview(img, box, out_path):
    preview = img.copy()
    x1, y1, x2, y2 = box
    cv2.rectangle(preview, (x1, y1), (x2, y2), (0, 255, 0), 4)
    ok = cv2.imwrite(str(out_path), preview)
    if not ok:
        print(f"[WARN] Failed to save preview: {out_path}")


def sha1_file(path: Path) -> str:
    h = hashlib.sha1()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()


def read_existing_hashes():
    seen = set()
    for report_path in [REPORT_CSV, APPEND_REPORT_CSV]:
        if not report_path.exists():
            continue
        with report_path.open("r", encoding="utf-8", newline="") as f:
            reader = csv.DictReader(f)
            for row in reader:
                file_hash = (row.get("file_hash") or "").strip()
                if file_hash:
                    seen.add(file_hash)
    return seen


def next_index(folder: Path, prefix: str) -> int:
    max_idx = 0
    for pattern in [f"{prefix}_*.jpg", f"{prefix}_*.jpeg", f"{prefix}_*.png", f"{prefix}_*.bmp", f"{prefix}_*.webp", f"{prefix}_*.tif", f"{prefix}_*.tiff"]:
        for p in folder.glob(pattern):
            try:
                idx = int(p.stem.split("_")[-1])
                max_idx = max(max_idx, idx)
            except ValueError:
                continue
    return max_idx + 1


def choose_split(rng: random.Random) -> str:
    return "train" if rng.random() < TRAIN_RATIO else "val"


def build_new_name(split: str, index: int, ext: str) -> str:
    return f"receipt_{split}_{index:04d}{ext.lower()}"


def main():
    ensure_dirs()
    rng = random.Random(RANDOM_SEED)

    print(f"BASE_DIR   : {BASE_DIR}")
    print(f"RAW_DIR    : {RAW_DIR}")
    print(f"DATASET_DIR: {DATASET_DIR}")
    print(f"REPORT_CSV : {REPORT_CSV}")
    print(f"APPEND_CSV : {APPEND_REPORT_CSV}")

    files = sorted([p for p in RAW_DIR.iterdir() if p.is_file() and p.suffix.lower() in IMAGE_EXTS])
    print(f"Found {len(files)} raw images in {RAW_DIR}")

    if not files:
        print("No images found in raw_images. Put your new source images in:")
        print(RAW_DIR)
        return

    existing_hashes = read_existing_hashes()
    print(f"Known previously processed hashes: {len(existing_hashes)}")

    train_idx = next_index(IMAGES_TRAIN, "receipt_train")
    val_idx = next_index(IMAGES_VAL, "receipt_val")

    rows = []
    appended = 0
    skipped = 0
    review = 0

    for src in files:
        file_hash = sha1_file(src)
        if file_hash in existing_hashes:
            rows.append({
                "original_name": src.name,
                "new_name": "",
                "split": "",
                "status": "skipped_existing",
                "label_written": False,
                "note": "hash_already_processed",
                "file_hash": file_hash,
            })
            skipped += 1
            continue

        split_name = choose_split(rng)
        ext = src.suffix.lower()

        if split_name == "train":
            new_name = build_new_name(split_name, train_idx, ext)
            train_idx += 1
            img_dir = IMAGES_TRAIN
            lbl_dir = LABELS_TRAIN
            prev_dir = PREVIEWS_TRAIN
        else:
            new_name = build_new_name(split_name, val_idx, ext)
            val_idx += 1
            img_dir = IMAGES_VAL
            lbl_dir = LABELS_VAL
            prev_dir = PREVIEWS_VAL

        dst_img = img_dir / new_name
        dst_lbl = lbl_dir / f"{Path(new_name).stem}.txt"
        dst_prev = prev_dir / new_name
        dst_review = IMAGES_REVIEW / new_name

        shutil.copy2(src, dst_img)

        img = cv2.imread(str(dst_img))
        status = "review"
        note = ""
        label_written = False

        if img is None:
            shutil.copy2(src, dst_review)
            note = "opencv_read_failed"
            review += 1
        else:
            h, w = img.shape[:2]
            box = detect_receipt_box(img)

            if box is not None:
                with open(dst_lbl, "w", encoding="utf-8") as f:
                    f.write(to_yolo_line(box, w, h) + "\n")
                save_preview(img, box, dst_prev)
                status = "labeled"
                label_written = True
                appended += 1
            else:
                shutil.copy2(src, dst_review)
                note = "receipt_not_found"
                review += 1

        rows.append({
            "original_name": src.name,
            "new_name": new_name,
            "split": split_name,
            "status": status,
            "label_written": label_written,
            "note": note,
            "file_hash": file_hash,
        })

    write_header = not APPEND_REPORT_CSV.exists()
    with open(APPEND_REPORT_CSV, "a", newline="", encoding="utf-8") as f:
        fieldnames = ["original_name", "new_name", "split", "status", "label_written", "note", "file_hash"]
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        if write_header:
            writer.writeheader()
        writer.writerows(rows)

    print("Done.")
    print(f"Appended labeled images : {appended}")
    print(f"Skipped existing images : {skipped}")
    print(f"Needs review            : {review}")
    print(f"Check review images     : {IMAGES_REVIEW}")
    print(f"Check train previews    : {PREVIEWS_TRAIN}")
    print(f"Check val previews      : {PREVIEWS_VAL}")
    print(f"Append report CSV       : {APPEND_REPORT_CSV}")
    print("\nImportant: this script APPENDS new images only. It does not delete the old dataset.")


if __name__ == "__main__":
    main()