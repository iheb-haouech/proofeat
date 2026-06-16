const { getMenu, matchMenuItems, normalizeMenuText } = require("./menuLoader");
const { parseTicketData } = require("./ticketExtract");

const MENU_XLSX_PATH = process.env.MENU_XLSX_PATH || require("path").join(__dirname, "..", "..", "ocr_service", "Grille-tarifaire-Chamas-2.xlsx");

function buildMenuIndex() {
  const items = getMenu();
  const byName = new Map();

  for (const entry of items) {
    const key = normalizeMenuText(entry.name);
    if (!key) continue;

    const existing = byName.get(key);
    if (!existing) {
      byName.set(key, entry);
      continue;
    }

    if (entry.price && !existing.price) existing.price = entry.price;
    if (entry.category && !existing.category) existing.category = entry.category;
  }

  return byName;
}

function detectPlatform(text) {
  const normalized = String(text || "").toLowerCase();
  if (normalized.includes("uber eats") || normalized.includes("uber eats")) return "uber_eats";
  if (normalized.includes("deliveroo")) return "deliveroo";
  if (normalized.includes("chamas")) return "chamas";
  return "unknown";
}

function validateOrder(rawText) {
  const parsed = parseTicketData(rawText || "");
  const menuIndex = buildMenuIndex();
  const anomalies = [];
  const items = [];
  let computedTotal = 0;

  const sourceItems = Array.isArray(parsed.items) ? parsed.items : [];

  for (const item of sourceItems) {
    const matches = matchMenuItems(item.name || "", 70);
    const best = matches[0] || null;
    const quantity = Number(item.quantity) || 1;

    const matchedName = best?.name || null;
    const matchedPrice = best?.price ?? item.unitPrice ?? null;

    if (matchedPrice !== null) computedTotal += matchedPrice * quantity;

    const entry = {
      name: item.name,
      quantity,
      detectedUnitPrice: item.unitPrice ?? null,
      matchedName,
      matchedPrice,
      expectedTotal: matchedPrice !== null ? Math.round(matchedPrice * quantity * 100) / 100 : null,
      status: best ? "matched" : "unknown_item",
    };

    if (!best) {
      anomalies.push({
        type: "unknown_item",
        item: item.name,
        message: `Article non reconnu : "${item.name}"`,
      });
    } else if (best.score < 85) {
      entry.status = "fuzzy_match";
      anomalies.push({
        type: "fuzzy_match",
        item: item.name,
        matched: matchedName,
        score: best.score,
        message: `Article approximatif : "${item.name}" ≈ "${matchedName}" (${best.score}%)`,
      });
    }

    if (item.unitPrice && matchedPrice !== null && Math.abs(item.unitPrice - matchedPrice) > 0.5) {
      entry.status = "price_mismatch";
      anomalies.push({
        type: "price_mismatch",
        item: item.name,
        detectedPrice: item.unitPrice,
        menuPrice: matchedPrice,
        message: `Écart de prix sur "${item.name}" : détecté ${item.unitPrice.toFixed(2)}€ vs menu ${matchedPrice.toFixed(2)}€`,
      });
    }

    items.push(entry);
  }

  const ticketTotal = parsed.totalAmount ?? null;
  let totalMatch = true;
  let totalDiff = null;

  if (ticketTotal !== null) {
    totalDiff = Math.round(Math.abs(ticketTotal - computedTotal) * 100) / 100;
    const pct = ticketTotal > 0 ? (totalDiff / ticketTotal) * 100 : 0;

    if (pct > 15) {
      totalMatch = false;
      anomalies.push({
        type: "total_mismatch",
        ticketTotal,
        computedTotal: Math.round(computedTotal * 100) / 100,
        diff: totalDiff,
        pct: Math.round(pct * 100) / 100,
        message: `Écart total important : ticket ${ticketTotal.toFixed(2)}€ vs menu ${computedTotal.toFixed(2)}€ (${pct.toFixed(1)}%)`,
      });
    }
  }

  const hasItems = items.length > 0;
  const hasTotal = ticketTotal !== null;
  const confidence = computeConfidence({
    hasTicket: !!parsed.ticketNumber,
    hasCustomer: !!parsed.customerName,
    hasItems,
    hasTotal,
    anomalyCount: anomalies.length,
    menuMatchRate: hasItems ? items.filter((i) => i.status === "matched").length / items.length : 0,
  });

  const isValid = anomalies.length === 0 && (hasItems || hasTotal);

  return {
    isValid,
    confidence,
    platform: detectPlatform(rawText || ""),
    summary: {
      ticketNumber: parsed.ticketNumber,
      customerName: parsed.customerName,
      ticketDate: parsed.ticketDate,
      ticketTotal,
      computedTotal: Math.round(computedTotal * 100) / 100,
      totalMatch,
      totalDiff,
      itemsCount: items.length,
      anomaliesCount: anomalies.length,
    },
    items,
    anomalies,
  };
}

function computeConfidence({ hasTicket, hasCustomer, hasItems, hasTotal, anomalyCount, menuMatchRate }) {
  let score = 0;
  if (hasTicket) score += 25;
  if (hasCustomer) score += 15;
  if (hasItems) score += 25;
  if (hasTotal) score += 15;
  score += Math.max(0, Math.min(20, menuMatchRate * 20));
  score -= Math.min(20, anomalyCount * 5);
  return Math.max(0, Math.min(100, Math.round(score)));
}

module.exports = {
  validateOrder,
  detectPlatform,
  computeConfidence,
};
