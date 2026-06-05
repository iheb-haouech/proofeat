import os
import cv2
import numpy as np

DEFAULT_MODEL_NAME = "receipt_detector.onnx"
DEFAULT_YOLO_NAME = "receipt_detector.pt"

class ReceiptDetector:
    def __init__(self, model_path=None, input_size=640, conf_threshold=0.10, iou_threshold=0.45):
        self.model_path = model_path or os.environ.get("RECEIPT_DETECTOR_MODEL_PATH")
        if not self.model_path:
            default_onxx = os.path.join(os.path.dirname(__file__), DEFAULT_MODEL_NAME)
            default_yolo = os.path.join(os.path.dirname(__file__), DEFAULT_YOLO_NAME)
            self.model_path = default_yolo if os.path.exists(default_yolo) else default_onxx

        self.input_size = input_size
        self.conf_threshold = conf_threshold
        self.iou_threshold = iou_threshold
        self.yolo_model = None
        self.onnx_net = None
        self.model_type = None
        self._load_model()

    def _load_model(self):
        if not self.model_path or not os.path.exists(self.model_path):
            self.yolo_model = None
            self.onnx_net = None
            self.model_type = None
            return

        path_lower = self.model_path.lower()
        if path_lower.endswith(".pt"):
            try:
                from ultralytics import YOLO
                self.yolo_model = YOLO(self.model_path)
                self.model_type = "yolo"
                return
            except Exception as exc:
                print("[ReceiptDetector] failed to load YOLO model:", exc)
                self.yolo_model = None

        if path_lower.endswith(".onnx") or self.yolo_model is None:
            try:
                self.onnx_net = cv2.dnn.readNetFromONNX(self.model_path)
                self.model_type = "onnx"
                return
            except Exception as exc:
                print("[ReceiptDetector] failed to load ONNX model:", exc)
                self.onnx_net = None

        self.model_type = None

    def detect_receipt_box(self, image):
        if self.yolo_model is not None:
            box = self._detect_yolo(image)
            if box is not None:
                return box

        if self.onnx_net is not None:
            return self._detect_onnx(image)

        return None

    def _detect_yolo(self, image):
        try:
            results = self.yolo_model(image)
            if not results or len(results) == 0:
                return None
            result = results[0]
            if not hasattr(result, "boxes") or len(result.boxes) == 0:
                return None

            boxes = []
            xyxy = result.boxes.xyxy.cpu().numpy()
            scores = result.boxes.conf.cpu().numpy()
            for coords, score in zip(xyxy, scores):
                if score < self.conf_threshold:
                    continue
                boxes.append([float(coords[0]), float(coords[1]), float(coords[2]), float(coords[3]), float(score)])

            if not boxes:
                return None
            return max(boxes, key=lambda b: (b[2] - b[0]) * (b[3] - b[1]))[:4]
        except Exception as exc:
            print("[ReceiptDetector] YOLO detection failed:", exc)
            return None

    def _detect_onnx(self, image):
        if self.onnx_net is None:
            return None

        h, w = image.shape[:2]
        blob = cv2.dnn.blobFromImage(image, 1 / 255.0, (self.input_size, self.input_size), swapRB=True, crop=False)
        self.onnx_net.setInput(blob)
        output = self.onnx_net.forward()

        boxes = self._parse_yolo_output(output, (w, h))
        if not boxes:
            return None
        return max(boxes, key=lambda b: (b[2] - b[0]) * (b[3] - b[1]))

    def crop_receipt(self, image, box):
        x1, y1, x2, y2 = [int(max(0, v)) for v in box]
        if x2 <= x1 or y2 <= y1:
            return image
        return image[y1:y2, x1:x2]

    def _parse_yolo_output(self, output, image_size):
        if output is None:
            return []

        if isinstance(output, list) and len(output) == 1:
            output = output[0]

        if output.ndim == 3 and output.shape[0] == 1:
            output = output[0]

        if output.ndim != 2 or output.shape[1] < 6:
            return []

        img_w, img_h = image_size
        preds = output

        coords = preds[:, :4]
        objectness = preds[:, 4]
        class_scores = preds[:, 5:]
        if class_scores.size == 0:
            return []

        confidences = objectness * np.max(class_scores, axis=1)
        mask = confidences > self.conf_threshold
        if not np.any(mask):
            return []

        coords = coords[mask]
        confidences = confidences[mask]

        if np.max(coords) <= 1.0:
            coords[:, 0] *= img_w
            coords[:, 1] *= img_h
            coords[:, 2] *= img_w
            coords[:, 3] *= img_h

        boxes = []
        for (cx, cy, bw, bh), score in zip(coords, confidences):
            x1 = float(cx - bw / 2)
            y1 = float(cy - bh / 2)
            x2 = float(cx + bw / 2)
            y2 = float(cy + bh / 2)
            boxes.append([x1, y1, x2, y2, float(score)])

        return self._nms(boxes)

    def _nms(self, boxes):
        if not boxes:
            return []

        rects = [[b[0], b[1], b[2] - b[0], b[3] - b[1]] for b in boxes]
        scores = [b[4] for b in boxes]
        indices = cv2.dnn.NMSBoxes(rects, scores, self.conf_threshold, self.iou_threshold)
        if len(indices) == 0:
            return []

        selected = []
        for i in indices.flatten() if hasattr(indices, "flatten") else [int(indices)]:
            selected.append(boxes[i][:4])
        return selected
