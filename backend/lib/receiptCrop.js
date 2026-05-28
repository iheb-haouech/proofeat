const path = require("path");
const sharp = require("sharp");

const PROCESSED_DIR = path.join(__dirname, "..", "processed");

/**
 * Single optimized crop: top-left receipt (Uber Eats ticket # lives here).
 * Max width 1200px for fast OCR.
 */
async function buildReceiptCrop(inputPath) {
  const meta = await sharp(inputPath).metadata();
  const width = meta.width || 0;
  const height = meta.height || 0;
  if (!width || !height) return inputPath;

  const leftW = Math.min(width, Math.floor(width * 0.55));
  const topH = Math.min(height, Math.floor(height * 0.5));
  const out = path.join(
    PROCESSED_DIR,
    `crop-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.jpg`
  );

  await sharp(inputPath)
    .extract({ left: 0, top: 0, width: leftW, height: topH })
    .resize({ width: 1200, withoutEnlargement: true })
    .grayscale()
    .normalize()
    .sharpen()
    .jpeg({ quality: 85 })
    .toFile(out);

  return out;
}

module.exports = { buildReceiptCrop };
