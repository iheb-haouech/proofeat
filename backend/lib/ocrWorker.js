// backend/lib/ocrWorker.js
const fs = require("fs");
const axios = require("axios");
const FormData = require("form-data");
const { buildReceiptCrops } = require("./receiptCrop");
const path = require("path");
const OCR_URL = process.env.OCR_URL || "http://127.0.0.1:8000";

async function warmupOcr() {
  try {
    await axios.get(`${OCR_URL}/health`, { timeout: 15000 });
    console.log("[OCR] Ready");
  } catch (e) {
    console.warn("[OCR] warmup failed:", e.message);
  }
}

function isValidTicketNumber(v) {
  return /^#[A-Z0-9]{3,8}$/.test(v || "");
}


function hasUsefulReceiptData(result) {
  const hasTotal = !!result.parsedData?.totalAmount;
  const hasItems = Array.isArray(result.parsedData?.items) && result.parsedData.items.length > 0;
  const hasCustomer = !!result.customerName;
  const hasText = (result.text || "").length > 30;
  const hasTicket = !!result.ticketNumber;

  return (
    (hasTotal && hasItems) ||
    (hasCustomer && hasItems) ||
    (hasTicket && hasText) ||
    (hasTotal && hasText)
  );
}

function scoreResult(result) {
  let score = 0;

  if (result.ticketNumber) score += 8;
  if (result.customerName) score += 6;
  if (result.parsedData?.totalAmount) score += 6;
  if (Array.isArray(result.parsedData?.items) && result.parsedData.items.length > 0) {
    score += Math.min(result.parsedData.items.length * 3, 12);
  }
  if (result.text && result.text.length > 80) score += 6;
  if (result.text && /uber\s*eats|deliveroo/i.test(result.text)) score += 3;

  return score;
}

async function callOcr(filePath, timeoutMs = 90000) {
  const form = new FormData();
  form.append("file", fs.createReadStream(filePath));
  const startTime = Date.now();
  console.log("[OCR] Calling", `${OCR_URL}/extract-order`, "with", filePath);

  try {
    const res = await axios.post(`${OCR_URL}/extract-order`, form, {
      headers: { ...form.getHeaders() },
      timeout: timeoutMs,
      maxBodyLength: Infinity,
      maxContentLength: Infinity,
    });
    const elapsed = Date.now() - startTime;
    console.log(`[OCR] Success in ${elapsed}ms for ${path.basename(filePath)}`);

    return {
      ticketNumber: res.data.ticketNumber || null,
      customerName: res.data.customerName || null,
      processedPath: res.data.processedPath || null,
      text: res.data.text || "",
      headerText: res.data.headerText || "",
      parsedData: res.data.parsedData || null,
    };
  } catch (err) {
    const elapsed = Date.now() - startTime;
    console.error(`[OCR] Error after ${elapsed}ms:`, err.message);
    throw err;
  }
}

async function readTicketFromImage(inputPath) {
  const candidates = await buildReceiptCrops(inputPath);
  console.log(`[OCR] Processing ${candidates.length} candidates from ${path.basename(inputPath)}`);

  let best = {
    ticketNumber: null,
    customerName: null,
    processedPath: null,
    text: "",
    headerText: "",
    parsedData: null,
  };
  let bestScore = -1;

  for (let i = 0; i < candidates.length; i++) {
    const candidate = candidates[i];
    try {
      const filePath = candidate.path || candidate;
      const isOriginal = i === 0;
      const timeoutMs = isOriginal ? 90000 : 60000;
      console.log(`[OCR] Attempt ${i + 1}/${candidates.length}: ${candidate.label} (timeout: ${timeoutMs}ms)`);

      const result = await callOcr(filePath, timeoutMs);
      const score = scoreResult(result);

      console.log("[OCR DEBUG]", {
      label: candidate.label,
      ticketNumber: result.ticketNumber,
      customerName: result.customerName,
      totalAmount: result.parsedData?.totalAmount,
      items: result.parsedData?.items?.length || 0,
      textPreview: (result.text || "").slice(0, 200),
      score,
    });

      if (score > bestScore) {
        best = {
          ...result,
          processedPath: result.processedPath || filePath,
        };
        bestScore = score;
        console.log(`[OCR] New best score: ${score} for ${candidate.label}`);
      }

      if (hasUsefulReceiptData(result)) {
      console.log("[OCR] Found usable receipt data, stopping search");
      break;
     }
    } catch (err) {
      console.error(`[OCR] Candidate ${i + 1} failed:`, candidate.path || candidate, {
        message: err.message,
        code: err.code,
      });

      if (err.code === "ECONNABORTED" && i === 0) {
  console.warn("[OCR] First attempt timed out, trying next candidate");
  continue;
}
    }
  }

  return best;
}

module.exports = {
  warmupOcr,
  readTicketFromImage,
};