import re
import pandas as pd
from rapidfuzz import process, fuzz
from unidecode import unidecode

PRODUCT_COLS = {
    "produits", "produit", "options", "sous option", "sous option produit"
}

STOPWORDS = {
    "uber", "eats", "rushour", "client", "commande", "telephone", "code",
    "methode", "paiement", "carte", "nombre", "produits", "total", "date",
    "ticket", "prep", "prepare", "passee", "notes", "couverts", "nouveau"
}

BAD_CLIENT_WORDS = {
    "commande", "telephone", "code", "paiement", "carte",
    "uber", "eats", "rushour", "menu", "tacos", "total"
}

def norm(text: str) -> str:
    if text is None:
        return ""
    text = unidecode(str(text)).lower().strip()
    text = re.sub(r'[#€]', ' ', text)
    text = re.sub(r'[^a-z0-9\s+.-]', ' ', text)
    text = re.sub(r'\s+', ' ', text).strip()
    return text

def looks_like_noise(text: str) -> bool:
    t = norm(text)
    if not t:
        return True
    if len(t) < 2:
        return True
    if re.fullmatch(r'[0-9\s.,:/-]+', t):
        return True
    if t in STOPWORDS:
        return True
    return False

class MenuMatcher:
    def __init__(self, xlsx_path: str):
        self.xlsx_path = xlsx_path
        self.catalog = []
        self.catalog_norms = []
        self._load_catalog()

    def _load_catalog(self):
        sheets = pd.read_excel(self.xlsx_path, sheet_name=None)
        seen = set()
        rows = []

        for sheet_name, df in sheets.items():
            for col in df.columns:
                col_name = norm(col)
                if col_name not in PRODUCT_COLS:
                    continue

                for value in df[col].dropna().astype(str):
                    raw = value.strip()
                    n = norm(raw)
                    if not n or len(n) < 2:
                        continue
                    if n in seen:
                        continue
                    seen.add(n)
                    rows.append({
                        "name": raw,
                        "norm": n,
                        "sheet": sheet_name,
                        "column": str(col)
                    })

        self.catalog = rows
        self.catalog_norms = [r["norm"] for r in rows]

    def _best_match(self, line_norm: str):
        m1 = process.extractOne(line_norm, self.catalog_norms, scorer=fuzz.token_set_ratio)
        m2 = process.extractOne(line_norm, self.catalog_norms, scorer=fuzz.token_sort_ratio)
        m3 = process.extractOne(line_norm, self.catalog_norms, scorer=fuzz.partial_ratio)

        candidates = [m for m in [m1, m2, m3] if m]
        if not candidates:
            return None

        matched_norm, score, idx = max(candidates, key=lambda x: x[1])
        return matched_norm, score, idx

    def match_line(self, line: str, threshold: int = 84):
        line_norm = norm(line)
        if looks_like_noise(line_norm):
            return None

        matched = self._best_match(line_norm)
        if not matched:
            return None

        matched_norm, score, idx = matched
        if score < threshold:
            return None

        item = self.catalog[idx]
        return {
            "ocr_line": line,
            "matched_name": item["name"],
            "matched_norm": item["norm"],
            "score": score,
            "sheet": item["sheet"],
            "column": item["column"]
        }

    def match_lines(self, lines, threshold: int = 84):
        results = []
        used = set()

        for line in lines:
            m = self.match_line(line, threshold=threshold)
            if not m:
                continue

            key = m["matched_norm"]
            if key in used:
                continue

            used.add(key)
            results.append(m)

        results.sort(key=lambda x: x["score"], reverse=True)
        return results

def extract_ticket_number(lines):
    candidates = []

    for raw in lines:
        line = str(raw or "")
        if not line.strip():
            continue

        compact = line.upper().replace(" ", "")
        for code in re.findall(r'#[A-Z0-9]{3,8}', compact):
            if code not in candidates:
                candidates.append(code)

        for code in re.findall(r'#\s*([A-Z0-9]{3,8})', line, flags=re.I):
            normalized = f"#{code.upper()}"
            if normalized not in candidates:
                candidates.append(normalized)

    if candidates:
        return candidates[0]

    header_text = " ".join(lines).replace(" ", "").upper()
    matches = re.findall(r'#[A-Z0-9]{3,8}', header_text, flags=re.I)
    matches = list(dict.fromkeys(matches))
    if matches:
        return matches[0]

    return None

def extract_total(lines):
    labeled = []

    for line in lines:
        if "total" in norm(line):
            vals = re.findall(r'([0-9]+[.,][0-9]{2})', line)
            labeled.extend(vals)

    if labeled:
        return float(labeled[-1].replace(",", "."))

    euro_lines = []
    for line in lines:
        vals = re.findall(r'([0-9]+[.,][0-9]{2})\s*€?', line)
        if vals:
            euro_lines.extend(vals)

    if euro_lines:
        return float(euro_lines[-1].replace(",", "."))

    return None

def extract_client_name(lines):
    clean = [str(x).strip() for x in lines if str(x).strip()]

    for i, raw in enumerate(clean):
        n = norm(raw)
        if "client" in n:
            same_line = re.sub(r'(?i)^.*client\s*:?\s*', '', raw).strip()
            if _is_valid_client_name(same_line):
                return same_line

            for j in range(i + 1, min(i + 4, len(clean))):
                candidate = clean[j].strip()
                if _is_valid_client_name(candidate):
                    return candidate

    for raw in clean[:12]:
        if _is_valid_client_name(raw):
            return raw.strip()

    return None

def _is_valid_client_name(candidate: str) -> bool:
    c = norm(candidate)
    if not c:
        return False
    if len(c) < 3 or len(c) > 40:
        return False
    if re.search(r'[0-9]{3,}', c):
        return False
    if len(c.split()) > 4:
        return False
    if any(word in c for word in BAD_CLIENT_WORDS):
        return False
    if not re.search(r'[a-z]', c):
        return False
    return True

def extract_candidate_item_lines(lines):
    out = []

    for line in lines:
        raw = str(line).strip()
        n = norm(raw)

        if not n:
            continue
        if len(n) < 2:
            continue
        if any(word in n for word in [
            "uber eats", "client", "commande", "telephone", "code", "paiement",
            "carte", "nombre de produits", "total", "notes", "pas de couverts"
        ]):
            continue
        if re.fullmatch(r'[0-9\s.,:/#-]+', n):
            continue

        out.append(raw)

    return out

def build_order_result(ocr_lines, matcher: MenuMatcher):
    ticket_number = extract_ticket_number(ocr_lines)
    client_name = extract_client_name(ocr_lines)
    total = extract_total(ocr_lines)
    candidate_lines = extract_candidate_item_lines(ocr_lines)
    matched_items = matcher.match_lines(candidate_lines, threshold=84)

    return {
        "ticketNumber": ticket_number,
        "customerName": client_name,
        "processedPath": None,
        "text": "\n".join(ocr_lines),
        "parsedData": {
            "phoneNumber": None,
            "ticketDate": None,
            "totalAmount": total,
            "items": [
                {
                    "ocr": x["ocr_line"],
                    "name": x["matched_name"],
                    "quantity": 1,
                    "unitPrice": None,
                    "totalPrice": None,
                    "confidence": x["score"]
                }
                for x in matched_items
            ]
        }
    }