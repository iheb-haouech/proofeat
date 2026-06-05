require("dotenv/config");
const express = require("express");
const cors = require("cors");
const fs = require("fs");
const path = require("path");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const multer = require("multer");
const axios = require("axios");
const { PrismaClient } = require("@prisma/client");
const { warmupOcr, readTicketFromImage } = require("./lib/ocrWorker");
const { parseTicketData } = require("./lib/ticketExtract");
const inventoryRoutes = require("./routes/inventory.routes");
const inventoryController = require("./controllers/inventory.controller");
const ensureSuperAdmin = require("./utils/ensureSuperAdmin");
const usersRouter = require("./routes/users");
const { requireAuth } = require("./middleware/auth");

const prisma = new PrismaClient();
const app = express();
const JWT_SECRET = process.env.JWT_SECRET || "dev-secret-change-me";
const PORT = process.env.PORT || 5000;

app.use(cors({ origin: true }));
app.use(express.json({ limit: "10mb" }));
app.use("/inventory", inventoryRoutes);
app.use("/users", usersRouter);

const uploadsDir = path.join(__dirname, "uploads");
const processedDir = path.join(__dirname, "processed");
const stockInvoicesDir = path.join(__dirname, "stock-invoices");

if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });
if (!fs.existsSync(processedDir)) fs.mkdirSync(processedDir, { recursive: true });
if (!fs.existsSync(stockInvoicesDir)) fs.mkdirSync(stockInvoicesDir, { recursive: true });

app.use("/uploads", express.static(uploadsDir));
app.use("/processed", express.static(processedDir));
app.use("/stock-invoices", express.static(stockInvoicesDir));

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadsDir),
  filename: (_req, file, cb) => {
    const safe = (file.originalname || "photo.jpg").replace(/[^\w.\-]+/g, "_");
    cb(null, `${Date.now()}-${safe}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 15 * 1024 * 1024 },
});

const stockInvoiceStorage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, stockInvoicesDir),
  filename: (_req, file, cb) => {
    const safe = (file.originalname || "facture.jpg").replace(/[^\w.\-]+/g, "_");
    cb(null, `${Date.now()}-${safe}`);
  },
});

const stockInvoiceUpload = multer({
  storage: stockInvoiceStorage,
  limits: { fileSize: 15 * 1024 * 1024 },
});

function isAdminLike(user) {
  return user.role === "ADMIN" || user.role === "SUPERADMIN";
}

function toApiRow(row) {
  return {
    id: String(row.id),
    imageUrl: row.imageUrl,
    processedUrl: row.processedUrl,
    orderCode: row.ticketNumber,
    customerName: row.customerName,
    phoneNumber: row.phoneNumber,
    ticketDate: row.ticketDate ? row.ticketDate.toISOString() : null,
    totalAmount: row.totalAmount,
    parsedData: row.parsedData,
    scannedBy: row.user?.email ?? null,
    status: row.status,
    createdAt: row.createdAt.toISOString(),
    originalName: row.originalName,
    rawText: row.rawText,
  };
}

async function copyProcessedFile(sourcePath) {
  if (!sourcePath || !fs.existsSync(sourcePath)) {
    return null;
  }

  const filename = path.basename(sourcePath);
  const targetPath = path.join(processedDir, filename);

  try {
    await fs.promises.copyFile(sourcePath, targetPath);
    return `/processed/${filename}`;
  } catch (err) {
    console.warn("Failed to copy processed receipt image:", err?.message || err);
    return null;
  }
}

// --- Auth ---
app.post("/auth/register", async (req, res) => {
  try {
    const email = String(req.body?.email || "").trim().toLowerCase();
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

    const isAdminEmail = String(process.env.ADMIN_EMAILS || "")
      .split(",")
      .map((item) => item.trim().toLowerCase())
      .filter(Boolean)
      .includes(email);

    const userCount = await prisma.user.count();
    const role = isAdminEmail || userCount === 0 ? "ADMIN" : "CLIENT";

    const hash = await bcrypt.hash(password, 10);
    const user = await prisma.user.create({
      data: { email, password: hash, role },
    });

    const token = jwt.sign(
      {
        id: user.id,
        email: user.email,
        role: user.role,
      },
      JWT_SECRET,
      { expiresIn: "7d" }
    );

    res.status(201).json({
      token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
      },
    });
  } catch (err) {
    console.error("REGISTER:", err);
    res.status(500).json({ message: "Inscription impossible" });
  }
});

async function handleLogin(req, res) {
  try {
    const email = String(req.body?.email || "").trim().toLowerCase();
    const password = String(req.body?.password || "");

    const user = await prisma.user.findUnique({ where: { email } });

    if (!user || !(await bcrypt.compare(password, user.password))) {
      return res.status(401).json({ message: "Email ou mot de passe incorrect" });
    }

    const token = jwt.sign(
      {
        id: user.id,
        email: user.email,
        role: user.role,
      },
      JWT_SECRET,
      { expiresIn: "7d" }
    );

    res.json({
      token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
      },
    });
  } catch (err) {
    console.error("LOGIN:", err);
    res.status(500).json({ message: "Connexion impossible" });
  }
}

app.post("/auth/login", handleLogin);
app.post("/login", handleLogin);

app.post(
  "/inventory/invoice-backups/upload",
  requireAuth,
  stockInvoiceUpload.single("file"),
  inventoryController.uploadInvoiceBackup
);

async function processScanAsync(scanId, inputPath) {
  try {
    const result = await readTicketFromImage(inputPath);
    let processedUrl = null;

    if (result.processedPath) {
      processedUrl = await copyProcessedFile(result.processedPath);
    }

    const parsed = result.parsedData || parseTicketData(result.text || "");

    await prisma.proofCamScan.update({
      where: { id: scanId },
      data: {
        ticketNumber: result.ticketNumber || parsed.ticketNumber,
        customerName: result.customerName || parsed.customerName,
        phoneNumber: parsed.phoneNumber,
        ticketDate: parsed.ticketDate ? new Date(parsed.ticketDate) : null,
        totalAmount: parsed.totalAmount ?? null,
        parsedData: parsed,
        processedUrl,
        rawText: (result.text || "").slice(0, 12000),
        status: result.ticketNumber || parsed.ticketNumber ? "done" : "failed",
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

// --- ProofCam ---
app.get("/proofcam", requireAuth, async (req, res) => {
  try {
    const where = isAdminLike(req.user) ? {} : { userId: req.user.id };

    const rows = await prisma.proofCamScan.findMany({
      where,
      include: { user: true },
      orderBy: { createdAt: "desc" },
      take: 500,
    });

    res.json(rows.map(toApiRow));
  } catch (err) {
    res.status(500).json({ message: "Could not load scans", details: err.message });
  }
});

app.get("/proofcam/:id", requireAuth, async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (Number.isNaN(id)) return res.status(400).json({ message: "Invalid id" });

  const row = await prisma.proofCamScan.findUnique({
    where: { id },
    include: { user: true },
  });

  if (!row) return res.status(404).json({ message: "Not found" });

  if (!isAdminLike(req.user) && row.userId !== req.user.id) {
    return res.status(403).json({ message: "Accès refusé" });
  }

  res.json(toApiRow(row));
});

app.delete("/proofcam/:id", requireAuth, async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (Number.isNaN(id)) return res.status(400).json({ message: "Invalid id" });

  const row = await prisma.proofCamScan.findUnique({ where: { id } });
  if (!row) return res.status(404).json({ message: "Not found" });

  if (!isAdminLike(req.user) && row.userId !== req.user.id) {
    return res.status(403).json({ message: "Accès refusé" });
  }

  const removeFile = (url) => {
    if (!url || typeof url !== "string") return;

    const normalized = url.replace(/^\//, "");
    const filename = path.basename(normalized);
    const dir = normalized.startsWith("processed/") ? processedDir : uploadsDir;
    const filePath = path.join(dir, filename);

    if (fs.existsSync(filePath)) {
      try {
        fs.unlinkSync(filePath);
      } catch (err) {
        console.warn("Failed to remove file:", filePath, err.message || err);
      }
    }
  };

  removeFile(row.imageUrl);
  removeFile(row.processedUrl);

  await prisma.proofCamScan.delete({ where: { id } });
  res.json({ ok: true });
});

app.post("/proofcam/upload", requireAuth, upload.single("file"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: "No image uploaded" });
    }

    const imageUrl = `/uploads/${req.file.filename}`;
    const inputPath = path.join(uploadsDir, req.file.filename);

    const row = await prisma.proofCamScan.create({
      data: {
        imageUrl,
        originalName: req.file.originalname,
        status: "processing",
        userId: req.user.id,
      },
      include: { user: true },
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

app.post("/proofcam/:id/reprocess", requireAuth, async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (Number.isNaN(id)) return res.status(400).json({ message: "Invalid id" });

  const row = await prisma.proofCamScan.findUnique({ where: { id } });
  if (!row) return res.status(404).json({ message: "Scan introuvable" });

  if (!isAdminLike(req.user) && row.userId !== req.user.id) {
    return res.status(403).json({ message: "Accès refusé" });
  }

  const filename = path.basename(row.imageUrl || "");
  const inputPath = path.join(uploadsDir, filename);

  if (!fs.existsSync(inputPath)) {
    return res.status(404).json({ message: "Fichier image introuvable" });
  }

  await prisma.proofCamScan.update({
    where: { id },
    data: { status: "processing" },
  });

  setImmediate(() => processScanAsync(id, inputPath));

  const updated = await prisma.proofCamScan.findUnique({
    where: { id },
    include: { user: true },
  });

  return res.json(toApiRow(updated));
});

app.get("/health", async (_req, res) => {
  try {
    const [ocrHealth, modelHealth] = await Promise.all([
      axios.get("http://127.0.0.1:8000/health", { timeout: 3000 }),
      axios.get("http://127.0.0.1:8000/model-health", { timeout: 3000 }),
    ]);

    return res.json({
      ok: true,
      backend: "ok",
      ocr: ocrHealth.data,
      modelHealth: modelHealth.data,
    });
  } catch (err) {
    return res.status(500).json({
      ok: false,
      backend: "ok",
      error: err?.message || String(err),
    });
  }
});

app.get("/dashboard", requireAuth, async (req, res) => {
  try {
    const where = isAdminLike(req.user) ? {} : { userId: req.user.id };

    const rows = await prisma.proofCamScan.findMany({
      where,
      include: { user: true },
      orderBy: { createdAt: "desc" },
      take: 200,
    });

    const totalAmount = rows.reduce((sum, row) => sum + (row.totalAmount ?? 0), 0);
    const productMap = new Map();

    rows.forEach((row) => {
      const parsed = row.parsedData || {};
      const items = Array.isArray(parsed.items) ? parsed.items : [];

      items.forEach((item) => {
        const key = String(item.name || "").trim();
        if (!key) return;

        const existing = productMap.get(key) || {
          name: key,
          quantity: 0,
          amount: 0,
        };

        const qty = Number(item.quantity) || 1;
        const amount = Number(item.totalPrice) || Number(item.unitPrice) * qty || 0;

        existing.quantity += qty;
        existing.amount += amount;
        productMap.set(key, existing);
      });
    });

    const productTotals = [...productMap.values()].sort((a, b) => b.quantity - a.quantity);

    res.json({
      scans: rows.length,
      totalAmount,
      recentScans: rows.map(toApiRow),
      productTotals,
    });
  } catch (err) {
    console.error("DASHBOARD:", err);
    res.json({ scans: 0, totalAmount: 0, recentScans: [], productTotals: [] });
  }
});

app.get("/orders", requireAuth, async (req, res) => {
  try {
    const where = isAdminLike(req.user) ? {} : { userId: req.user.id };

    const rows = await prisma.proofCamScan.findMany({
      where,
      include: { user: true },
      orderBy: { createdAt: "desc" },
      take: 100,
    });

    res.json(rows.map(toApiRow));
  } catch (err) {
    console.error("ORDERS:", err);
    res.json([]);
  }
});

async function startServer() {
  try {
    await ensureSuperAdmin();
    await warmupOcr().catch((e) => {
      console.warn("[OCR] warmup failed:", e.message);
    });

    app.listen(PORT, () => {
      console.log(`Server running on http://localhost:${PORT}`);
    });
  } catch (error) {
    console.error("Startup error:", error);
    process.exit(1);
  }
}

startServer();

process.on("SIGINT", async () => {
  await prisma.$disconnect();
  process.exit(0);
});