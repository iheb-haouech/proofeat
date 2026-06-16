const fs = require("fs");
const path = require("path");

const MENU_XLSX_PATH = process.env.MENU_XLSX_PATH || path.join(__dirname, "..", "..", "ocr_service", "Grille-tarifaire-Chamas-2.xlsx");

let menuCache = null;

function parseXlsxLike(filePath) {
  const content = fs.readFileSync(filePath, "utf-8");

  const lines = content.split(/\r?\n/);
  const products = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    const parts = line.split(/\t/).map((p) => p.trim());
    const first = parts[0] || "";
    const second = parts[1] || "";
    const third = parts[2] || "";

    if (!first && !second && !third) continue;

    if (/^---/.test(first) || /^Sheet:/i.test(first)) continue;

    if (/^Cat\u00e9gories|^Nos Menus|^Produits|^Options/i.test(first)) continue;

    if (!first && second && third) {
      products.push({
        category: second,
        name: third,
        price: extractFirstPrice(parts),
      });
      continue;
    }

    if (first && second && third) {
      products.push({
        category: second,
        name: third,
        price: extractFirstPrice(parts),
      });
      continue;
    }

    if (first && second && !third) {
      products.push({
        category: second,
        name: second,
        price: extractFirstPrice(parts),
      });
      continue;
    }

    if (first && !second && !third) {
      products.push({
        category: first,
        name: first,
        price: extractFirstPrice(parts),
      });
      continue;
    }
  }

  return products;
}

function extractFirstPrice(parts) {
  for (const part of parts) {
    const m = part.match(/([0-9]+[.,][0-9]{2})\s*(?:€|EUR)?/);
    if (m) {
      return parseFloat(m[1].replace(",", "."));
    }
  }
  return null;
}

function normalizeMenuText(text) {
  return String(text || "")
    .replace(/[®©™]/g, "")
    .replace(/[^\w\s'-]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function getMenu() {
  if (menuCache) return menuCache;

  if (!fs.existsSync(MENU_XLSX_PATH)) {
    menuCache = [];
    return menuCache;
  }

  try {
    menuCache = parseXlsxLike(MENU_XLSX_PATH);
    console.log(`[MEAL_MATCHER] Loaded ${menuCache.length} menu items from Excel`);
  } catch (err) {
    console.error("[MEAL_MATCHER] Failed to load menu:", err.message);
    menuCache = [];
  }

  return menuCache;
}

function matchMenuItems(ocrItemName, threshold = 75) {
  const items = getMenu();
  if (!items.length) return [];

  const normalizedOcr = normalizeMenuText(ocrItemName);
  if (!normalizedOcr) return [];

  const results = [];

  for (const item of items) {
    normalizedMenu = normalizeMenuText(item.name);
    if (!normalizedMenu) continue;

    let score = 0;

    if (normalizedOcr === normalizedMenu) {
      score = 100;
    } else if (normalizedOcr.includes(normalizedMenu) || normalizedMenu.includes(normalizedOcr)) {
      score = 90;
    } else {
      const similarity = computeSimilarity(normalizedOcr, normalizedMenu);
      score = similarity;
    }

    if (score >= threshold) {
      results.push({
        name: item.name,
        category: item.category,
        price: item.price,
        score,
      });
    }
  }

  results.sort((a, b) => b.score - a.score);
  return results.slice(0, 3);
}

function computeSimilarity(a, b) {
  if (!a || !b) return 0;
  const lenA = a.length;
  const lenB = b.length;
  if (lenA === 0 || lenB === 0) return 0;

  const longer = lenA > lenB ? a : b;
  const shorter = lenA > lenB ? b : a;

  if (longer.includes(shorter)) {
    return Math.round((shorter.length / longer.length) * 100);
  }

  const wordsA = new Set(a.split(/\s+/));
  const wordsB = new Set(b.split(/\s+/));
  let commonCount = 0;
  for (const word of wordsA) {
    if (wordsB.has(word)) commonCount++;
  }
  const unionSize = wordsA.size + wordsB.size - commonCount;
  const jaccard = unionSize > 0 ? commonCount / unionSize : 0;

  const lengthDiff = Math.abs(lenA - lenB) / Math.max(lenA, lenB);
  const lengthScore = Math.max(0, 100 - lengthDiff * 100);

  return Math.round(jaccard * 100 * 0.7 + lengthScore * 0.3);
}

function validateOrder(parsedItems, parsedTotal, tolerancePct = 15) {
  const menuItems = getMenu();
  const results = {
    isValid: true,
    totalMatch: true,
    totalDiff: 0,
    items: [],
    anomalies: [],
  };

  let computedTotal = 0;

  for (const item of parsedItems) {
    const matches = matchMenuItems(item.name, 70);
    const bestMatch = matches[0] || null;

    const computedUnitPrice = bestMatch?.price ?? item.unitPrice ?? 0;
    const expectedItemTotal = computedUnitPrice * (item.quantity || 1);
    computedTotal += expectedItemTotal;

    const itemResult = {
      name: item.name,
      quantity: item.quantity || 1,
      detectedUnitPrice: item.unitPrice,
      matchedMenuName: bestMatch?.name || null,
      matchedPrice: bestMatch?.price || null,
      expectedTotal: expectedItemTotal,
      status: "ok",
    };

    if (!bestMatch) {
      itemResult.status = "unknown_item";
      results.anomalies.push({
        type: "unknown_item",
        message: `Article non reconnu dans le menu : "${item.name}"`,
        item: item.name,
      });
      results.isValid = false;
    } else if (bestMatch.score < 85) {
      itemResult.status = "fuzzy_match";
      results.anomalies.push({
        type: "fuzzy_match",
        message: `Article approximatif : "${item.name}" ≈ "${bestMatch.name}" (${bestMatch.score}%)`,
        item: item.name,
        matched: bestMatch.name,
        score: bestMatch.score,
      });
    } else {
      itemResult.status = "matched";
    }

    if (item.unitPrice && bestMatch?.price && Math.abs(item.unitPrice - bestMatch.price) > 0.5) {
      itemResult.status = "price_mismatch";
      results.anomalies.push({
        type: "price_mismatch",
        message: `Écart de prix sur "${item.name}" : détecté ${item.unitPrice.toFixed(2)}€ vs menu ${bestMatch.price.toFixed(2)}€`,
        item: item.name,
        detectedPrice: item.unitPrice,
        menuPrice: bestMatch.price,
      });
      results.isValid = false;
    }

    results.items.push(itemResult);
  }

  if (parsedTotal) {
    const diff = Math.abs(parsedTotal - computedTotal);
    const pctDiff = parsedTotal > 0 ? (diff / parsedTotal) * 100 : 0;
    results.totalDiff = diff;

    if (pctDiff > tolerancePct) {
      results.totalMatch = false;
      results.isValid = false;
      results.anomalies.push({
        type: "total_mismatch",
        message: `Écart total important : ticket ${parsedTotal.toFixed(2)}€ vs calculé ${computedTotal.toFixed(2)}€ (${pctDiff.toFixed(1)}%)`,
        ticketTotal: parsedTotal,
        computedTotal,
        diff,
        pctDiff,
      });
    }
  }

  return results;
}

module.exports = {
  getMenu,
  matchMenuItems,
  validateOrder,
  normalizeMenuText,
  computeSimilarity,
};
