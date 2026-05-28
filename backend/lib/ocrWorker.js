const { createWorker } = require("tesseract.js");
const { buildReceiptCrop } = require("./receiptCrop");
const {
  extractTicketNumber,
  extractCustomerName,
} = require("./ticketExtract");

let worker = null;
let initPromise = null;

function getWorker() {
  if (!initPromise) {
    initPromise = (async () => {
      console.log("[OCR] Loading engine (one-time)...");
      worker = await createWorker("eng", 1, {
        logger: () => {},
      });
      await worker.setParameters({
        tessedit_pageseg_mode: "6",
        tessedit_char_whitelist:
          "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789#.- ",
      });
      console.log("[OCR] Ready");
      return worker;
    })();
  }
  return initPromise;
}

async function warmupOcr() {
  await getWorker();
}

/**
 * Run OCR on receipt crop; early exit when ticket # found.
 */
async function readTicketFromImage(inputPath) {
  const w = await getWorker();
  const cropPath = await buildReceiptCrop(inputPath);

  const paths = [cropPath, inputPath];
  let bestText = "";
  let bestPath = cropPath;
  let bestTicket = null;

  for (const p of paths) {
    const { data } = await w.recognize(p);
    const text = data.text || "";
    const ticket = extractTicketNumber(text);

    if (ticket) {
      return {
        text,
        ticketNumber: ticket,
        customerName: extractCustomerName(text, ticket),
        processedPath: p === inputPath ? null : p,
      };
    }

    if (text.trim().length > bestText.trim().length) {
      bestText = text;
      bestPath = p;
    }
  }

  const ticketNumber = extractTicketNumber(bestText);
  return {
    text: bestText,
    ticketNumber,
    customerName: extractCustomerName(bestText, ticketNumber),
    processedPath: bestPath !== inputPath ? bestPath : null,
  };
}

module.exports = { warmupOcr, readTicketFromImage, getWorker };
