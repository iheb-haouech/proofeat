const sharp = require("sharp");
const path = require("path");

async function saveCrop(inputPath, outPath, region) {
  await sharp(inputPath)
    .extract(region)
    .jpeg({ quality: 92 })
    .toFile(outPath);
  return outPath;
}

async function buildReceiptCrops(inputPath) {
  const dir = path.dirname(inputPath);
  const base = path.parse(inputPath).name;

  const meta = await sharp(inputPath).metadata();
  const w = meta.width;
  const h = meta.height;

  const outputs = [{ path: inputPath, label: "original" }];

  const variants = [
    {
      label: "center",
      left: Math.floor(w * 0.08),
      top: Math.floor(h * 0.08),
      width: Math.floor(w * 0.84),
      height: Math.floor(h * 0.84),
    },
    {
      label: "left_receipt",
      left: Math.floor(w * 0.02),
      top: Math.floor(h * 0.20),
      width: Math.floor(w * 0.58),
      height: Math.floor(h * 0.76),
    },
    {
      label: "left_receipt_tight",
      left: Math.floor(w * 0.04),
      top: Math.floor(h * 0.18),
      width: Math.floor(w * 0.46),
      height: Math.floor(h * 0.78),
    },
    {
      label: "receipt_top",
      left: Math.floor(w * 0.03),
      top: Math.floor(h * 0.10),
      width: Math.floor(w * 0.52),
      height: Math.floor(h * 0.42),
    },
    {
      label: "receipt_middle",
      left: Math.floor(w * 0.05),
      top: Math.floor(h * 0.28),
      width: Math.floor(w * 0.50),
      height: Math.floor(h * 0.45),
    },
  ];

  for (const v of variants) {
    const cropPath = path.join(dir, `${base}_${v.label}.jpg`);
    await saveCrop(inputPath, cropPath, v);
    outputs.push({ path: cropPath, label: v.label });
  }

  return outputs;
}

module.exports = { buildReceiptCrops };