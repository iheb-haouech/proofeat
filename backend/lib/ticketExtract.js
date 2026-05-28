/** Uber Eats ticket IDs: #F544, #4B2C0, #391ED, #9A6E9, etc. */
function extractTicketNumber(text) {
  if (!text || !text.trim()) return null;

  const candidates = new Map();

  const add = (raw) => {
    const m = String(raw)
      .replace(/\s+/g, "")
      .match(/^#?([A-Z0-9]{4,6})$/i);
    if (!m) return;
    const code = `#${m[1].toUpperCase()}`;
    const score =
      (code.length === 6 ? 3 : code.length === 5 ? 2 : 1) +
      (/[0-9]/.test(code) && /[A-F]/.test(code) ? 2 : 0);
    const prev = candidates.get(code);
    if (!prev || score > prev.score) candidates.set(code, { code, score });
  };

  for (const m of text.matchAll(/#\s*([A-Z0-9]{4,6})\b/gi)) add(`#${m[1]}`);
  for (const m of text.matchAll(
    /(?:UBER\s*EATS|CHAMAS|COMMANDE)[\s\S]{0,120}?\b([A-F0-9]{4,6})\b/gi
  )) {
    add(`#${m[1]}`);
  }

  if (!candidates.size) {
    const loose = text.match(/#\s*([A-Z0-9]{3,8})/i);
    if (loose) add(loose[0]);
  }

  const ranked = [...candidates.values()].sort((a, b) => b.score - a.score);
  return ranked[0]?.code ?? null;
}

function extractCustomerName(text, ticketNumber) {
  const lines = text
    .replace(/\r/g, "\n")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

  const codeKey = ticketNumber
    ? ticketNumber.replace(/\s/g, "").toUpperCase()
    : null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const compact = line.replace(/\s/g, "").toUpperCase();

    if (codeKey && compact.includes(codeKey.replace("#", ""))) {
      const afterCode = line
        .replace(/.*#\s*[A-Z0-9]{4,6}/i, "")
        .trim();
      if (afterCode && /^[A-Za-zÀ-ÿ]/.test(afterCode)) return afterCode.slice(0, 60);

      for (let j = i + 1; j < Math.min(i + 5, lines.length); j++) {
        const next = lines[j];
        if (/^(?:client|commande|préparer|telephone|téléphone|méthode)/i.test(next))
          continue;
        if (/^[A-Za-zÀ-ÿ][\wÀ-ÿ.'-]*\s+[A-ZÀ-ÿ]\.?$/.test(next)) return next.slice(0, 60);
        if (/^[A-Za-zÀ-ÿ]+\s+[A-Za-zÀ-ÿ]+/.test(next) && next.length < 40)
          return next.slice(0, 60);
      }
    }
  }

  return null;
}

module.exports = { extractTicketNumber, extractCustomerName };
