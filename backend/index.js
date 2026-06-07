require("dotenv/config");
const express = require("express");
const cors = require("cors");
const fs = require("fs");
const path = require("path");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const multer = require("multer");
const axios = require("axios");
const cron = require("node-cron");
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
const datasetsDir = path.join(__dirname, "datasets");

if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });
if (!fs.existsSync(processedDir)) fs.mkdirSync(processedDir, { recursive: true });
if (!fs.existsSync(stockInvoicesDir)) fs.mkdirSync(stockInvoicesDir, { recursive: true });
if (!fs.existsSync(datasetsDir)) fs.mkdirSync(datasetsDir, { recursive: true });

app.use("/uploads", express.static(uploadsDir));
app.use("/processed", express.static(processedDir));
app.use("/stock-invoices", express.static(stockInvoicesDir));
app.use("/datasets", express.static(datasetsDir));

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

function getNextMondayAt8(base = new Date()) {
  const d = new Date(base);
  const day = d.getDay();
  const daysUntilMonday = day === 0 ? 1 : day === 1 ? 7 : 8 - day;
  d.setDate(d.getDate() + daysUntilMonday);
  d.setHours(8, 0, 0, 0);
  return d;
}

function diffInWholeWeeks(a, b) {
  const ms = b.getTime() - a.getTime();
  return Math.floor(ms / (7 * 24 * 60 * 60 * 1000));
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
  if (!sourcePath || !fs.existsSync(sourcePath)) return null;

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

function removeStoredFile(url) {
  if (!url || typeof url !== "string") return;

  const normalized = url.replace(/^\//, "");
  const filename = path.basename(normalized);

  let dir = uploadsDir;
  if (normalized.startsWith("processed/")) dir = processedDir;
  else if (normalized.startsWith("uploads/")) dir = uploadsDir;
  else if (normalized.startsWith("datasets/")) dir = datasetsDir;

  const filePath = path.join(dir, filename);

  if (fs.existsSync(filePath)) {
    try {
      fs.unlinkSync(filePath);
    } catch (err) {
      console.warn("Failed to remove file:", filePath, err?.message || err);
    }
  }
}

async function createAdminNotification(title, message, metadata = null) {
  await prisma.notification.createMany({
    data: [
      { title, message, role: "ADMIN", metadata },
      { title, message, role: "SUPERADMIN", metadata },
    ],
  });
}

async function getDatasetAnchor() {
  let anchor = await prisma.datasetRelease.findFirst({
    where: { kind: "proofcam-anchor" },
    orderBy: { createdAt: "asc" },
  });

  if (!anchor) {
    const nextMonday = getNextMondayAt8(new Date());

    anchor = await prisma.datasetRelease.create({
      data: {
        kind: "proofcam-anchor",
        availableFrom: nextMonday,
        availableUntil: nextMonday,
        isActive: false,
        metadata: { anchor: true },
      },
    });
  }

  return anchor;
}

async function shouldRunThreeWeekCycle(now = new Date()) {
  const anchor = await getDatasetAnchor();
  const anchorDate = new Date(anchor.availableFrom);

  if (now < anchorDate) return false;

  const weeks = diffInWholeWeeks(anchorDate, now);
  return weeks % 3 === 0;
}

async function generateProofcamDatasetRelease() {
  const scans = await prisma.proofCamScan.findMany({
    where: {
      ticketNumber: { not: null },
      status: { not: "processing" },
    },
    orderBy: { createdAt: "asc" },
  });

  const rows = scans.filter((s) => s.ticketNumber && s.ticketNumber.trim() !== "");
  if (!rows.length) {
    await createAdminNotification(
      "Dataset ProofCam non généré",
      "Aucun ticket étiqueté n'est disponible pour générer le dataset.",
      { kind: "proofcam" }
    );
    return null;
  }

  await prisma.datasetRelease.updateMany({
    where: { kind: "proofcam", isActive: true },
    data: { isActive: false },
  });

  const stamp = Date.now();
  const csvFilename = `proofcam_dataset_${stamp}.csv`;
  const jsonFilename = `proofcam_dataset_${stamp}.json`;
  const csvPath = path.join(datasetsDir, csvFilename);
  const jsonPath = path.join(datasetsDir, jsonFilename);

  const csvHeader = "id,image_relative,ticket_number,created_at\n";
  const csvBody = rows
    .map((r) => {
      const imageRelative = String(r.imageUrl || "").replace(/^\//, "");
      const safeTicket = String(r.ticketNumber || "").replace(/"/g, '""');
      return `${r.id},"${imageRelative}","${safeTicket}","${r.createdAt.toISOString()}"`;
    })
    .join("\n");

  const jsonDataset = {
    meta: {
      exported_at: new Date().toISOString(),
      total: rows.length,
      description: "ProofCam ticket dataset — image path + ground-truth ticket number label",
    },
    samples: rows.map((r) => ({
      id: r.id,
      image: String(r.imageUrl || "").replace(/^\//, ""),
      label: r.ticketNumber,
      created_at: r.createdAt.toISOString(),
    })),
  };

  await fs.promises.writeFile(csvPath, csvHeader + csvBody, "utf8");
  await fs.promises.writeFile(jsonPath, JSON.stringify(jsonDataset, null, 2), "utf8");

  const availableFrom = new Date();
  const availableUntil = new Date(availableFrom.getTime() + 48 * 60 * 60 * 1000);

  const release = await prisma.datasetRelease.create({
    data: {
      kind: "proofcam",
      csvPath,
      jsonPath,
      availableFrom,
      availableUntil,
      isActive: true,
      metadata: {
        total: rows.length,
        csvFilename,
        jsonFilename,
      },
    },
  });

  await createAdminNotification(
    "Dataset ProofCam prêt",
    `Le dataset est disponible au téléchargement pendant 48h, jusqu'au ${availableUntil.toISOString()}.`,
    {
      releaseId: release.id,
      total: rows.length,
      availableUntil: availableUntil.toISOString(),
    }
  );

  return release;
}

async function expireProofcamDatasetRelease() {
  const release = await prisma.datasetRelease.findFirst({
    where: {
      kind: "proofcam",
      isActive: true,
      availableUntil: { lte: new Date() },
    },
    orderBy: { createdAt: "desc" },
  });

  if (!release) return false;

  const scans = await prisma.proofCamScan.findMany();

  for (const row of scans) {
    removeStoredFile(row.imageUrl);
    removeStoredFile(row.processedUrl);
  }

  if (release.csvPath && fs.existsSync(release.csvPath)) {
    try {
      fs.unlinkSync(release.csvPath);
    } catch (err) {
      console.warn("Failed to remove csv dataset:", err?.message || err);
    }
  }

  if (release.jsonPath && fs.existsSync(release.jsonPath)) {
    try {
      fs.unlinkSync(release.jsonPath);
    } catch (err) {
      console.warn("Failed to remove json dataset:", err?.message || err);
    }
  }

  await prisma.proofCamScan.deleteMany({});
  await prisma.datasetRelease.update({
    where: { id: release.id },
    data: { isActive: false },
  });

  await createAdminNotification(
    "Dataset ProofCam expiré",
    "La fenêtre de téléchargement de 48h est terminée. Les tickets, images et exports ont été supprimés.",
    { releaseId: release.id }
  );

  return true;
}

function setupDatasetCron() {
  cron.schedule(
    "0 8 * * 1",
    async () => {
      try {
        await expireProofcamDatasetRelease();

        const now = new Date();
        const shouldRun = await shouldRunThreeWeekCycle(now);

        if (shouldRun) {
          await generateProofcamDatasetRelease();
        }
      } catch (err) {
        console.error("DATASET CRON:", err);
      }
    },
    {
      timezone: process.env.APP_TIMEZONE || "Africa/Tunis",
    }
  );
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
      { id: user.id, email: user.email, role: user.role },
      JWT_SECRET,
      { expiresIn: "7d" }
    );

    res.status(201).json({
      token,
      user: { id: user.id, email: user.email, name: user.name, role: user.role },
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
      { id: user.id, email: user.email, role: user.role },
      JWT_SECRET,
      { expiresIn: "7d" }
    );

    res.json({
      token,
      user: { id: user.id, email: user.email, name: user.name, role: user.role },
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

// --- Dataset routes first ---
app.get("/proofcam/dataset/stats", requireAuth, async (req, res) => {
  if (!isAdminLike(req.user)) {
    return res.status(403).json({ message: "Accès réservé aux administrateurs." });
  }

  try {
    const [total, labeled, processing, failed] = await Promise.all([
      prisma.proofCamScan.count(),
      prisma.proofCamScan.count({
        where: {
          ticketNumber: { not: null },
          status: { not: "processing" },
        },
      }),
      prisma.proofCamScan.count({ where: { status: "processing" } }),
      prisma.proofCamScan.count({ where: { status: "failed", ticketNumber: null } }),
    ]);

    res.json({ total, labeled, unlabeled: total - labeled, processing, failed });
  } catch (err) {
    console.error("DATASET/STATS:", err);
    res.status(500).json({ message: "Erreur lors du chargement des stats." });
  }
});

app.get("/proofcam/dataset/status", requireAuth, async (req, res) => {
  if (!isAdminLike(req.user)) {
    return res.status(403).json({ message: "Accès réservé aux administrateurs." });
  }

  try {
    await expireProofcamDatasetRelease();

    const release = await prisma.datasetRelease.findFirst({
      where: {
        kind: "proofcam",
        isActive: true,
        availableUntil: { gt: new Date() },
      },
      orderBy: { createdAt: "desc" },
    });

    if (!release) {
      return res.json({ available: false });
    }

    const msLeft = new Date(release.availableUntil).getTime() - Date.now();

    return res.json({
      available: msLeft > 0,
      availableFrom: release.availableFrom.toISOString(),
      availableUntil: release.availableUntil.toISOString(),
      hoursLeft: Math.max(0, Math.ceil(msLeft / (1000 * 60 * 60))),
    });
  } catch (err) {
    console.error("DATASET/STATUS:", err);
    res.status(500).json({ message: "Erreur lors du chargement du statut dataset." });
  }
});

app.get("/proofcam/dataset/csv", requireAuth, async (req, res) => {
  if (!isAdminLike(req.user)) {
    return res.status(403).json({ message: "Accès réservé aux administrateurs." });
  }

  try {
    await expireProofcamDatasetRelease();

    const release = await prisma.datasetRelease.findFirst({
      where: {
        kind: "proofcam",
        isActive: true,
        availableUntil: { gt: new Date() },
      },
      orderBy: { createdAt: "desc" },
    });

    if (!release?.csvPath || !fs.existsSync(release.csvPath)) {
      return res.status(404).json({ message: "Dataset CSV indisponible." });
    }

    return res.download(release.csvPath, path.basename(release.csvPath));
  } catch (err) {
    console.error("DATASET/CSV:", err);
    res.status(500).json({ message: "Erreur lors du téléchargement du CSV." });
  }
});

app.get("/proofcam/dataset/json", requireAuth, async (req, res) => {
  if (!isAdminLike(req.user)) {
    return res.status(403).json({ message: "Accès réservé aux administrateurs." });
  }

  try {
    await expireProofcamDatasetRelease();

    const release = await prisma.datasetRelease.findFirst({
      where: {
        kind: "proofcam",
        isActive: true,
        availableUntil: { gt: new Date() },
      },
      orderBy: { createdAt: "desc" },
    });

    if (!release?.jsonPath || !fs.existsSync(release.jsonPath)) {
      return res.status(404).json({ message: "Dataset JSON indisponible." });
    }

    return res.download(release.jsonPath, path.basename(release.jsonPath));
  } catch (err) {
    console.error("DATASET/JSON:", err);
    res.status(500).json({ message: "Erreur lors du téléchargement du JSON." });
  }
});

app.get("/notifications", requireAuth, async (req, res) => {
  if (!isAdminLike(req.user)) {
    return res.status(403).json({ message: "Accès réservé aux administrateurs." });
  }

  try {
    const rows = await prisma.notification.findMany({
      where: {
        OR: [{ role: null }, { role: req.user.role }],
      },
      orderBy: { createdAt: "desc" },
      take: 50,
    });

    res.json(rows);
  } catch (err) {
    console.error("NOTIFICATIONS:", err);
    res.status(500).json({ message: "Impossible de charger les notifications." });
  }
});

// --- ProofCam routes ---
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
    res.status(500).json({ message: "Upload failed", details: err?.message || String(err) });
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

app.patch("/proofcam/:id", requireAuth, async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (Number.isNaN(id)) return res.status(400).json({ message: "Invalid id" });

  try {
    const row = await prisma.proofCamScan.findUnique({ where: { id } });
    if (!row) return res.status(404).json({ message: "Not found" });

    if (!isAdminLike(req.user) && row.userId !== req.user.id) {
      return res.status(403).json({ message: "Accès refusé" });
    }

    const { orderCode } = req.body;
    if (!orderCode || typeof orderCode !== "string" || !orderCode.trim()) {
      return res.status(400).json({ message: "orderCode est requis" });
    }

    const normalized = orderCode.trim().toUpperCase();
    const ticketNumber = normalized.startsWith("#") ? normalized : `#${normalized}`;

    const updated = await prisma.proofCamScan.update({
      where: { id },
      data: {
        ticketNumber,
        status: row.status === "failed" || !row.ticketNumber ? "done" : row.status,
      },
      include: { user: true },
    });

    return res.json(toApiRow(updated));
  } catch (err) {
    console.error("PATCH /proofcam/:id:", err);
    return res.status(500).json({ message: "Erreur serveur lors de la mise à jour." });
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

  await prisma.proofCamScan.update({ where: { id }, data: { status: "processing" } });
  setImmediate(() => processScanAsync(id, inputPath));

  const updated = await prisma.proofCamScan.findUnique({
    where: { id },
    include: { user: true },
  });

  return res.json(toApiRow(updated));
});

app.delete("/proofcam/:id", requireAuth, async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (Number.isNaN(id)) return res.status(400).json({ message: "Invalid id" });

  const row = await prisma.proofCamScan.findUnique({ where: { id } });
  if (!row) return res.status(404).json({ message: "Not found" });

  if (!isAdminLike(req.user) && row.userId !== req.user.id) {
    return res.status(403).json({ message: "Accès refusé" });
  }

  removeStoredFile(row.imageUrl);
  removeStoredFile(row.processedUrl);

  await prisma.proofCamScan.delete({ where: { id } });
  res.json({ ok: true });
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

        const existing = productMap.get(key) || { name: key, quantity: 0, amount: 0 };
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

    setupDatasetCron();

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