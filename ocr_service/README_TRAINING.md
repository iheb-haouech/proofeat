# Receipt Detector Training

This directory contains helpers for training a local YOLO receipt detector.

## How to prepare training data

1. Copy receipt images into `ocr_service/dataset/images/train` and `ocr_service/dataset/images/val`.
2. Annotate your receipts using YOLO format label files.
   - Each image must have a corresponding `.txt` file in `dataset/labels/train` or `dataset/labels/val`.
   - Each line should contain: `0 x_center y_center width height`
   - Coordinates must be normalized between 0 and 1.

## Helpful command

From the `ocr_service` folder:

```bash
python train_receipt_detector.py --prepare --backend-uploads ../backend/uploads
python train_receipt_detector.py --create-yaml
python train_receipt_detector.py --train --model yolov8n.pt --epochs 50
```

## Notes

- `--prepare` copies all images from the backend upload folder into the dataset structure.
- You still need to label the images before training.
- After training, set `RECEIPT_DETECTOR_MODEL_PATH` to the trained model path and restart the OCR service.
