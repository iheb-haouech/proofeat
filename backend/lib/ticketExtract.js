function normalizeText(text) {
  return String(text || "")
    .replace(/\r/g, "\n")
    .replace(/[|]/g, " ")
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/Uber\s*Eals/gi, "Uber Eats")
    .replace(/Ubor\s*Eats/gi, "Uber Eats")
    .replace(/Sprlte/gi, "Sprite")
    .replace(/Caca/gi, "Coca")
    .replace(/Coca\s*Cala/gi, "Coca Cola")
    .replace(/Frlte/gi, "Frite")
    .replace(/TotaI/gi, "Total")
    .replace(/CIient/gi, "Client")
    .replace(/\n{2,}/g, "\n")
    .trim();
}

function normalizeLines(text) {
  return normalizeText(text)
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

function extractTicketNumber(text) {
  text = normalizeText(text);
  if (!text) return null;

  const lines = normalizeLines(text);
  const candidates = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    for (const m of line.matchAll(/#\s*([A-Z0-9]{4,8})\b/gi)) {
      candidates.push({
        code: `#${m[1].toUpperCase()}`,
        score: 10 - Math.min(i, 5),
      });
    }

    if (/uber\s*eats|deliveroo|commande|chamas|livraison|client/i.test(line)) {
      for (const m of line.matchAll(/\b([A-Z0-9]{4,8})\b/gi)) {
        candidates.push({
          code: `#${m[1].toUpperCase()}`,
          score: 6 - Math.min(i, 5),
        });
      }
    }
  }

  if (!candidates.length) {
    for (const line of lines) {
      if (/uber\s*eats|deliveroo|commande|code|client/i.test(line)) {
        const m = line.match(/\b([A-Z0-9]{4,8})\b/i);
        if (m) return `#${m[1].toUpperCase()}`;
      }
    }

    const loose = text.match(/#?\s*([A-Z0-9]{3,8})/i);
    if (loose) return `#${loose[1].toUpperCase()}`;

    return null;
  }

  candidates.sort((a, b) => b.score - a.score);
  return candidates[0].code;
}

function isLikelyPersonName(line) {
  if (!line) return false;

  const clean = line.trim();

  if (clean.length < 2 || clean.length > 50) return false;
  if (/\d/.test(clean)) return false;
  if (/uber\s*eats|deliveroo|chamas|tacos|jaude|rushour/i.test(clean)) return false;
  if (/client|commande|préparer|preparer|telephone|téléphone|méthode|methode|code|paiement|notes?/i.test(clean)) return false;
  if (/^pas de couverts?$/i.test(clean)) return false;
  if (/^[A-Z\s]+$/.test(clean) && clean.split(/\s+/).length > 4) return false;

  return /^[A-Za-zÀ-ÿ][A-Za-zÀ-ÿ.'-]*(?:\s+[A-Za-zÀ-ÿ][A-Za-zÀ-ÿ.'-]*){0,3}\.?$/.test(clean);
}

function extractCustomerName(text, ticketNumber) {
  const lines = normalizeLines(text);
  const codeKey = ticketNumber ? ticketNumber.replace("#", "").toUpperCase() : null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const compact = line.replace(/\s/g, "").toUpperCase();

    if (codeKey && compact.includes(codeKey)) {
      for (let j = i + 1; j < Math.min(i + 8, lines.length); j++) {
        const next = lines[j].trim();

        if (/client a commandé|client a commande|nouveau client/i.test(next)) continue;
        if (/^(client|commande|préparer|preparer|telephone|téléphone|méthode|methode|code|notes?)/i.test(next)) continue;

        if (isLikelyPersonName(next)) {
          return next.replace(/\.$/, "").trim();
        }
      }
    }
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    const m = line.match(/^client[:\-]?\s*(.+)$/i);
    if (m && isLikelyPersonName(m[1])) {
      return m[1].replace(/\.$/, "").trim();
    }

    if (/client a commandé|client a commande|nouveau client/i.test(line)) {
      const prev = lines[i - 1];
      const next = lines[i + 1];

      if (prev && isLikelyPersonName(prev)) return prev.replace(/\.$/, "").trim();
      if (next && isLikelyPersonName(next)) return next.replace(/\.$/, "").trim();
    }
  }

  for (const line of lines) {
    if (isLikelyPersonName(line)) {
      return line.replace(/\.$/, "").trim();
    }
  }

  return null;
}

function extractPhoneNumber(text) {
  text = normalizeText(text);
  const match = text.match(/((?:\+33|0033|0)[\s.\-]?[1-9](?:[\s.\-]?\d{2}){4})/);
  return match ? match[1].replace(/[\s.\-]/g, "") : null;
}

function extractDate(text) {
  text = normalizeText(text);
  const match = text.match(/(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})(?:\s+(\d{1,2}:\d{2}(?::\d{2})?))?/);
  if (!match) return null;
  const dateText = `${match[1]}${match[2] ? ` ${match[2]}` : ""}`.replace(/-/g, "/");
  const parsed = Date.parse(dateText);
  return Number.isNaN(parsed) ? null : new Date(parsed).toISOString();
}

function extractTotalAmount(text) {
  const lines = normalizeLines(text);

  const strong = [];
  const weak = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    let m = line.match(/(?:^|\b)(total(?:\s*ttc)?|montant(?:\s+total)?|à\s*payer|a\s*payer)\s*[:\-]?\s*([0-9]+[.,][0-9]{2})/i);
    if (m) {
      strong.push(parseFloat(m[2].replace(",", ".")));
      continue;
    }

    m = line.match(/([0-9]+[.,][0-9]{2})\s*(?:€|EUR)?$/i);
    if (m) {
      const amount = parseFloat(m[1].replace(",", "."));
      if (/total|payer|ttc/i.test(line)) strong.push(amount);
      else weak.push(amount);
    }
  }

  if (strong.length) return strong[strong.length - 1];
  if (weak.length) return weak[weak.length - 1];
  return null;
}

function extractPrimaryItem(text) {
  const lines = normalizeLines(text);

  for (const line of lines) {
    if (shouldIgnoreLine(line) || isModifierLine(line)) continue;

    const m = line.match(/^\s*(\d+)\s*[xX]\s+(.+?)\s+([0-9]+[.,][0-9]{2})\s*(?:€|EUR)?$/);
    if (m) {
      return {
        name: cleanItemName(m[2]),
        quantity: Number(m[1]),
        totalPrice: parseFloat(m[3].replace(",", ".")),
      };
    }
  }

  return null;
}

function shouldIgnoreLine(line) {
  return /^(?:total|sous[-\s]?total|tva|remise|paiement|cb|visa|mastercard|merci|heure|date|restaurant|lien|www\.|tel|téléphone|client|commande|méthode|methode|code téléphone|code telephone|notes?|ajouter|pas de couverts|nombre de produits)/i.test(line);
}

function isModifierLine(line) {
  return /^(?:taille|taille au choix|sauce|sauces|sauces produit à composer|sauces produit a composer|viande|viandes|une viande au choix|deux viande au choix|deux viandes au choix|double\s*:\s*2 viandes|double|blanche|algérienne|algerienne|barbecue|ketchup|mayonnaise|cordon bleu|biggy|boisson|frites|frite|gratina?ge|mozzarella|tenders|simple|curry|salade|rosti|kebab|poulet mariné|poulet marine|composer)$/i.test(
    String(line || "").trim()
  );
}

function isPriceOnlyLine(line) {
  return /^\s*[0-9]+[.,][0-9]{2}\s*(?:€|EUR)?\s*$/i.test(line);
}

function shouldIgnoreLine(line) {
  return /^(?:total|sous[-\s]?total|tva|remise|paiement|cb|visa|mastercard|merci|heure|date|restaurant|lien|www\.|tel|téléphone|client|commande|méthode|methode|code téléphone|code telephone|notes?|ajouter|pas de couverts|nombre de produits|préparer|preparer|nouveau client|client a commandé|client a commande)/i.test(line);
}

function isModifierLine(line) {
  return /^(?:sauce|sauces|blanche|algérienne|algerienne|barbecue|ketchup|mayonnaise|cordon bleu|biggy|taille|boisson|frites|frite|gratina?ge|mozzarella|tenders|simple|une viande au choix|curry|salade|rosti|kebab|poulet mariné|poulet marine|produit à composer|produit a composer|garniture offerte|tacos à composer|tacos a composer|composer)/i.test(line);
}

function isPriceOnlyLine(line) {
  return /^\s*[0-9]+[.,][0-9]{2}\s*(?:€|EUR)?\s*$/i.test(line);
}

function cleanItemName(name) {
  return String(name || "")
    .replace(/^\-+\s*/, "")
    .replace(/\s+/g, " ")
    .trim();
}

function extractLineItems(text) {
  const lines = normalizeLines(text);
  const items = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (shouldIgnoreLine(line)) continue;

    const qtyInline = line.match(/^\s*(\d+)\s*[xX]\s+(.+?)\s+([0-9]+[.,][0-9]{2})\s*(?:€|EUR)?$/);
    if (qtyInline) {
      const quantity = Number(qtyInline[1]);
      const name = cleanItemName(qtyInline[2]);
      const totalPrice = parseFloat(qtyInline[3].replace(",", "."));

      if (name && !isModifierLine(name)) {
        items.push({
          name,
          quantity,
          unitPrice: Math.round((totalPrice / quantity) * 100) / 100,
          totalPrice,
        });
      }
      continue;
    }

    const qtyBlock = line.match(/^\s*(\d+)\s*[xX]\s+(.+)$/);
    if (qtyBlock) {
      const quantity = Number(qtyBlock[1]);
      let nameParts = [cleanItemName(qtyBlock[2])];
      let amount = null;
      let consumed = 0;

      for (let j = i + 1; j < Math.min(lines.length, i + 6); j++) {
        const next = lines[j].trim();

        if (isPriceOnlyLine(next)) {
          amount = parseFloat(next.match(/[0-9]+[.,][0-9]{2}/)[0].replace(",", "."));
          consumed = j - i;
          break;
        }

        if (/^\s*\d+\s*[xX]\s+/.test(next)) break;
        if (shouldIgnoreLine(next)) break;

        if (!isModifierLine(next) && next.length > 1 && !/\d{1,2}[.,]\d{2}/.test(next)) {
          nameParts.push(cleanItemName(next));
          continue;
        }

        if (isModifierLine(next)) {
          continue;
        }

        break;
      }

      const name = cleanItemName(nameParts.join(" "));
      if (name && !isModifierLine(name)) {
        items.push({
          name,
          quantity,
          unitPrice: amount != null ? Math.round((amount / quantity) * 100) / 100 : undefined,
          totalPrice: amount != null ? amount : undefined,
        });
        i += consumed;
      }

      continue;
    }

    const singleLine = line.match(/^(.+?)\s+([0-9]+[.,][0-9]{2})\s*(?:€|EUR)?$/);
    if (singleLine) {
      const name = cleanItemName(singleLine[1]);
      const price = parseFloat(singleLine[2].replace(",", "."));

      if (!name || shouldIgnoreLine(name) || isModifierLine(name)) continue;

      items.push({
        name,
        quantity: 1,
        unitPrice: price,
        totalPrice: price,
      });
      continue;
    }

    const next = lines[i + 1];
    if (
      next &&
      isPriceOnlyLine(next) &&
      !shouldIgnoreLine(line) &&
      !isModifierLine(line)
    ) {
      const name = cleanItemName(line);
      const price = parseFloat(next.match(/[0-9]+[.,][0-9]{2}/)[0].replace(",", "."));

      if (name.length > 1) {
        items.push({
          name,
          quantity: 1,
          unitPrice: price,
          totalPrice: price,
        });
        i += 1;
      }
    }
  }

  return items.filter((item) => item.name && item.name.length > 1);
}

function parseTicketData(text) {
  const cleanText = normalizeText(text);
  const ticketNumber = extractTicketNumber(cleanText);
  const customerName = extractCustomerName(cleanText, ticketNumber);
  const phoneNumber = extractPhoneNumber(cleanText);
  const ticketDate = extractDate(cleanText);
  const items = extractLineItems(cleanText);
  const primaryItem = extractPrimaryItem(cleanText);
  const finalItems =
  primaryItem && !items.some((i) => i.name.toLowerCase() === primaryItem.name.toLowerCase())
    ? [primaryItem, ...items]
    : items;
  const fallbackTotal = items.reduce((sum, item) => sum + item.totalPrice, 0);
  const totalAmount = extractTotalAmount(cleanText) ?? (fallbackTotal || undefined);

  console.log("[PARSED]", {
  ticketNumber,
  customerName,
  items,
  totalAmount,
});

  return {
    ticketNumber,
    customerName,
    phoneNumber,
    ticketDate,
    totalAmount,
    items: finalItems,
  };
}


module.exports = {
  normalizeText,
  extractTicketNumber,
  extractCustomerName,
  parseTicketData,
};