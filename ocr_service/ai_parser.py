import os
import re
import json

OPENAI_API_KEY_ENV = "OPENAI_API_KEY"
OPENAI_MODEL_ENV = "OPENAI_MODEL"
LOCAL_LLM_MODEL_PATH_ENV = "LOCAL_LLM_MODEL_PATH"
LOCAL_LLM_TEMPERATURE_ENV = "LOCAL_LLM_TEMPERATURE"
LOCAL_LLM_MAX_TOKENS_ENV = "LOCAL_LLM_MAX_TOKENS"
DEFAULT_MODEL = "gpt-3.5-turbo"
DEFAULT_LOCAL_TEMPERATURE = 0.0
DEFAULT_LOCAL_MAX_TOKENS = 700

PROMPT_TEMPLATE = """You are a receipt extraction assistant.
Extract the following fields from the OCR text exactly as JSON:
- ticketNumber: ticket code starting with # or null
- customerName: customer name or null
- phoneNumber: phone number or null
- ticketDate: date/time in ISO 8601 format or null
- totalAmount: numeric total amount or null
- items: list of objects with name, quantity, unitPrice, totalPrice, confidence

Return only valid JSON. Do not add any commentary or markdown.
Use null for missing values and an empty list when there are no items.
If you are not sure about a field, return null.

Text:
{ocr_text}
"""

class AiParser:
    def __init__(self):
        self.api_key = os.environ.get(OPENAI_API_KEY_ENV)
        self.model = os.environ.get(OPENAI_MODEL_ENV, DEFAULT_MODEL)
        self.local_model_path = os.environ.get(LOCAL_LLM_MODEL_PATH_ENV)
        self.local_temperature = float(os.environ.get(LOCAL_LLM_TEMPERATURE_ENV, DEFAULT_LOCAL_TEMPERATURE))
        self.local_max_tokens = int(os.environ.get(LOCAL_LLM_MAX_TOKENS_ENV, DEFAULT_LOCAL_MAX_TOKENS))

    def is_enabled(self):
        return bool(self.api_key or self.local_model_path)

    def is_ready(self):
        if self.local_model_path:
            try:
                from llama_cpp import Llama  # noqa: F401
            except ImportError:
                return {
                    "enabled": False,
                    "mode": "local",
                    "reason": "llama-cpp-python package not installed",
                }

            if not os.path.exists(self.local_model_path):
                return {
                    "enabled": False,
                    "mode": "local",
                    "reason": "local model file not found",
                    "path": self.local_model_path,
                }

            return {
                "enabled": True,
                "mode": "local",
                "model_path": self.local_model_path,
            }

        if self.api_key:
            try:
                import openai  # noqa: F401
            except ImportError:
                return {
                    "enabled": False,
                    "mode": "openai",
                    "reason": "openai package not installed",
                }

            return {
                "enabled": True,
                "mode": "openai",
                "model": self.model,
            }

        return {
            "enabled": False,
            "mode": None,
            "reason": "no local model path or OpenAI API key configured",
        }

    def parse(self, ocr_text, baseline=None):
        if self.local_model_path:
            local_result = self._parse_local(ocr_text, baseline)
            if local_result:
                return local_result

        if self.api_key:
            return self._parse_openai(ocr_text, baseline)

        return None

    def _parse_openai(self, ocr_text, baseline=None):
        try:
            import openai
        except ImportError:
            return None

        openai.api_key = self.api_key
        prompt = PROMPT_TEMPLATE.format(ocr_text=ocr_text)

        try:
            response = openai.ChatCompletion.create(
                model=self.model,
                messages=[
                    {"role": "system", "content": "You are a helpful assistant for extracting structured fields from receipt OCR text."},
                    {"role": "user", "content": prompt},
                ],
                temperature=0.0,
                max_tokens=700,
            )
        except Exception:
            return None

        raw_content = response.choices[0].message.get("content", "")
        return self._build_result(raw_content, ocr_text, baseline)

    def _parse_local(self, ocr_text, baseline=None):
        try:
            from llama_cpp import Llama
        except ImportError:
            return None

        if not self.local_model_path or not os.path.exists(self.local_model_path):
            return None

        prompt = PROMPT_TEMPLATE.format(ocr_text=ocr_text)
        try:
            with Llama(model_path=self.local_model_path) as llm:
                response = llm.create(
                    prompt=prompt,
                    max_tokens=self.local_max_tokens,
                    temperature=self.local_temperature,
                    stop=["\n\n"],
                )
        except Exception:
            return None

        raw_content = None
        if hasattr(response, "choices") and response.choices:
            raw_content = getattr(response.choices[0], "text", None) or response.choices[0].get("text")
        if raw_content is None:
            raw_content = str(response)

        return self._build_result(raw_content, ocr_text, baseline)

    def _build_result(self, raw_content, ocr_text, baseline=None):
        if not raw_content:
            return None

        parsed = self._parse_json(raw_content)
        if not parsed:
            return None

        result = baseline.copy() if baseline else {}
        result["ticketNumber"] = parsed.get("ticketNumber") or result.get("ticketNumber")
        result["customerName"] = parsed.get("customerName") or result.get("customerName")
        result["processedPath"] = result.get("processedPath")
        result["text"] = ocr_text

        parsed_data = result.get("parsedData", {}) or {}
        parsed_data["phoneNumber"] = parsed.get("phoneNumber") or parsed_data.get("phoneNumber")
        parsed_data["ticketDate"] = parsed.get("ticketDate") or parsed_data.get("ticketDate")
        parsed_data["totalAmount"] = parsed.get("totalAmount") or parsed_data.get("totalAmount")

        ai_items = parsed.get("items")
        if isinstance(ai_items, list) and ai_items:
            parsed_data["items"] = ai_items
        else:
            parsed_data["items"] = parsed_data.get("items", [])

        result["parsedData"] = parsed_data
        return result

    def _parse_json(self, content):
        if not content:
            return None

        json_text = self._extract_json_block(content)
        if not json_text:
            return None

        try:
            return json.loads(json_text)
        except json.JSONDecodeError:
            return None

    def _extract_json_block(self, text):
        if not text:
            return None

        start = text.find("{")
        end = text.rfind("}")
        if start == -1 or end == -1 or end <= start:
            return None
        return text[start:end+1]
