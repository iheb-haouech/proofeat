require("dotenv/config");
const express = require("express");
const cors = require("cors");
const fs = require("fs");
const path = require("path");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const multer = require("multer");
const { PrismaClient } = require("@prisma/client");
const { warmupOcr, readTicketFromImage } = require("./lib/ocrWorker");

const prisma = new PrismaClient();
const app = express();
const JWT_SECRET = process.env.JWT_SECRET || "dev-secret-change-me";

app.use(cors({ origin: true }));
app.use(express.json({ limit: "10mb" }));

const uploadsDir = path.join(__dirname, "uploads");
const processedDir = path.join(__dirname, "processed");
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });
if (!fs.existsSync(processedDir)) fs.mkdirSync(processedDir, { recursive: true });

app.use("/uploads", express.static(uploadsDir));
app.use("/processed", express.static(processedDir));

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadsDir),
  filename: (_req, file, cb) => {
    const safe = (file.originalname || "photo.jpg").replace(/[^\w.\-]+/g, "_");
    cb(null, `${Date.now()}-${safe}`);
  },
});
const upload = multer({ storage, limits: { fileSize: 15 * 1024 * 1024 } });

function toApiRow(row) {
  return {
    id: String(row.id),
    imageUrl: row.imageUrl,
    processedUrl: row.processedUrl,
    orderCode: row.ticketNumber,
    customerName: row.customerName,
    status: row.status,
    createdAt: row.createdAt.toISOString(),
    originalName: row.originalName,
    rawText: row.rawText,
  };
}

function authMiddleware(req, res, next) {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    return res.status(401).json({ message: "Connexion requise" });
  }
  try {
    req.user = jwt.verify(header.slice(7), JWT_SECRET);
    next();
  } catch {
    return res.status(401).json({ message: "Session expirée" });
  }
}

// ——— Auth ———
app.post("/auth/register", async (req, res) => {
  try {
    const email = String(req.body?.email || "")
      .trim()
      .toLowerCase();
    const password = String(req.body?.password || "");

    if (!email || !password) {
      return res.status(400).json({ message: "Email et mot de passe requis" });
    }
    if (password.length < 6) {
      return res.status(400).json({ message: "Mot de passe : 6 caractères minimum" });
    }

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      return res.status(409).json({ message: "Cet email est déjà utilisé" });
    }

    const hash = await bcrypt.hash(password, 10);
    const user = await prisma.user.create({
      data: { email, password: hash },
    });

    const token = jwt.sign({ userId: user.id, email: user.email }, JWT_SECRET, {
      expiresIn: "7d",
    });

    res.status(201).json({
      token,
      user: { id: user.id, email: user.email },
    });
  } catch (err) {
    console.error("REGISTER:", err);
    res.status(500).json({ message: "Inscription impossible" });
  }
});

async function handleLogin(req, res) {
  try {
    const email = String(req.body?.email || "")
      .trim()
      .toLowerCase();
    const password = String(req.body?.password || "");
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user || !(await bcrypt.compare(password, user.password))) {
      return res.status(401).json({ message: "Email ou mot de passe incorrect" });
    }
    const token = jwt.sign({ userId: user.id, email: user.email }, JWT_SECRET, {
      expiresIn: "7d",
    });
    res.json({ token, user: { id: user.id, email: user.email } });
  } catch (err) {
    console.error("LOGIN:", err);
    res.status(500).json({ message: "Connexion impossible" });
  }
}

app.post("/auth/login", handleLogin);
app.post("/login", handleLogin);

async function processScanAsync(scanId, inputPath) {
  try {
    const result = await readTicketFromImage(inputPath);
    const processedUrl = result.processedPath
      ? `/processed/${path.basename(result.processedPath)}`
      : null;

    await prisma.proofCamScan.update({
      where: { id: scanId },
      data: {
        ticketNumber: result.ticketNumber,
        customerName: result.customerName,
        processedUrl,
        rawText: (result.text || "").slice(0, 12000),
        status: result.ticketNumber ? "done" : "failed",
      },
    });
  } catch (err) {
    console.error(`OCR scan ${scanId}:`, err?.message || err);
    await prisma.proofCamScan.update({
      where: { id: scanId },
      data: { status: "failed" },
    });
  }
}

// ——— ProofCam ———
app.get("/proofcam", authMiddleware, async (_req, res) => {
  try {
    const rows = await prisma.proofCamScan.findMany({
      orderBy: { createdAt: "desc" },
      take: 500,
    });
    res.json(rows.map(toApiRow));
  } catch (err) {
    res.status(500).json({ message: "Could not load scans", details: err.message });
  }
});

app.get("/proofcam/:id", authMiddleware, async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (Number.isNaN(id)) return res.status(400).json({ message: "Invalid id" });
  const row = await prisma.proofCamScan.findUnique({ where: { id } });
  if (!row) return res.status(404).json({ message: "Not found" });
  res.json(toApiRow(row));
});

app.post("/proofcam/upload", authMiddleware, upload.single("image"), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ message: "No image uploaded" });

    const imageUrl = `/uploads/${req.file.filename}`;
    const inputPath = path.join(uploadsDir, req.file.filename);

    const row = await prisma.proofCamScan.create({
      data: {
        imageUrl,
        originalName: req.file.originalname,
        status: "processing",
      },
    });

    res.status(201).json(toApiRow(row));

    setImmediate(() => processScanAsync(row.id, inputPath));
  } catch (err) {
    console.error("UPLOAD:", err);
    res.status(500).json({
      message: "Upload failed",
      details: err?.message || String(err),
    });
  }
});

app.get("/dashboard", authMiddleware, async (_req, res) => {
  try {
    const [orders, scans] = await Promise.all([
      prisma.order.count(),
      prisma.proofCamScan.count(),
    ]);
    res.json({
      orders,
      claims: 0,
      recovered: 0,
      scans,
    });
  } catch {
    res.json({ orders: 0, claims: 0, recovered: 0, scans: 0 });
  }
});

app.get("/orders", authMiddleware, async (_req, res) => {
  try {
    const rows = await prisma.order.findMany({
      orderBy: { id: "desc" },
      take: 100,
    });
    res.json(rows);
  } catch {
    res.json([]);
  }
});

app.get("/health", (_req, res) => res.json({ ok: true, ocr: "warming" }));

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
  warmupOcr().catch((e) => console.warn("[OCR] warmup failed:", e.message));
});

process.on("SIGINT", async () => {
  await prisma.$disconnect();
  process.exit(0);
});
