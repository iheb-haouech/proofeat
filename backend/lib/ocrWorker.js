// backend/lib/ocrWorker.js
const fs = require("fs");
const axios = require("axios");
const FormData = require("form-data");

const OCR_URL = process.env.OCR_URL || "http://ocr:8000";

async function warmupOcr() {
  try {
    await axios.get(`${OCR_URL}/health`, { timeout: 3000 });
    console.log("[OCR] Ready");
  } catch (e) {
    console.warn("[OCR] warmup failed:", e.message);
  }
}

/**
 * @param {string} inputPath chemin complet du fichier image (dans backend/uploads)
 * @returns {Promise<{ticketNumber: string|null, customerName: string|null, processedPath: string|null, text: string}>}
 */
async function readTicketFromImage(inputPath) {
  const form = new FormData();
  form.append("file", fs.createReadStream(inputPath));

  try {
    const res = await axios.post(`${OCR_URL}/extract-order`, form, {
      headers: form.getHeaders(),
      timeout: 15000,
    });

    // Le service Python renvoie { ticketNumber, customerName, processedPath, text }
    return {
      ticketNumber: res.data.ticketNumber || null,
      customerName: res.data.customerName || null,
      processedPath: res.data.processedPath || null,
      text: res.data.text || "",
    };
  } catch (err) {
    console.error("[OCR] error:", err.response?.data || err.message);
    return {
      ticketNumber: null,
      customerName: null,
      processedPath: null,
      text: "",
    };
  }
}

module.exports = {
  warmupOcr,
  readTicketFromImage,
};