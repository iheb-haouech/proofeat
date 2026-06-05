const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

async function listProducts(req, res) {
  try {
    const products = await prisma.inventoryProduct.findMany({
      orderBy: { createdAt: "desc" },
      include: {
        alerts: true,
        usages: true,
        createdBy: {
          select: { id: true, email: true, role: true },
        },
      },
    });

    res.json(products);
  } catch (err) {
    res.status(500).json({
      message: "Could not load products",
      details: err.message,
    });
  }
}

async function createProduct(req, res) {
  try {
    if (req.user.role !== "ADMIN") {
      return res.status(403).json({ message: "Accès refusé" });
    }

    const { name, price, stockQuantity, stockUnit, alertThreshold } = req.body || {};

    if (!name || price == null || stockQuantity == null || !stockUnit || alertThreshold == null) {
      return res.status(400).json({ message: "Champs manquants" });
    }

    const product = await prisma.inventoryProduct.create({
      data: {
        name: String(name).trim(),
        price: Number(price),
        stockQuantity: Number(stockQuantity),
        stockUnit: String(stockUnit),
        alertThreshold: Number(alertThreshold),
        createdById: req.user.userId,
      },
    });

    res.status(201).json(product);
  } catch (err) {
    res.status(500).json({
      message: "Could not create product",
      details: err.message,
    });
  }
}

async function addUsage(req, res) {
  try {
    const { productId, quantity, unit } = req.body || {};

    const product = await prisma.inventoryProduct.findUnique({
      where: { id: Number(productId) },
    });

    if (!product) {
      return res.status(404).json({ message: "Produit introuvable" });
    }

    if (String(product.stockUnit) !== String(unit)) {
      return res.status(400).json({ message: "Unité invalide" });
    }

    const q = Number(quantity);
    if (!Number.isFinite(q) || q <= 0) {
      return res.status(400).json({ message: "Quantité invalide" });
    }

    if (product.stockQuantity < q) {
      return res.status(400).json({ message: "Stock insuffisant" });
    }

    const updated = await prisma.$transaction(async (tx) => {
      const next = await tx.inventoryProduct.update({
        where: { id: product.id },
        data: {
          stockQuantity: {
            decrement: q,
          },
        },
      });

      await tx.inventoryUsage.create({
        data: {
          productId: product.id,
          storeId: req.user.userId,
          quantity: q,
          unit: String(unit),
        },
      });

      if (next.stockQuantity <= next.alertThreshold) {
        await tx.stockAlert.create({
          data: {
            productId: product.id,
            message: `Stock faible: ${next.name} (${next.stockQuantity} ${next.stockUnit} restants)`,
          },
        });
      }

      return next;
    });

    res.json(updated);
  } catch (err) {
    res.status(500).json({
      message: "Could not save usage",
      details: err.message,
    });
  }
}

async function listAlerts(req, res) {
  try {
    const alerts = await prisma.stockAlert.findMany({
      orderBy: { createdAt: "desc" },
      include: { product: true },
    });

    res.json(alerts);
  } catch (err) {
    res.status(500).json({
      message: "Could not load alerts",
      details: err.message,
    });
  }
}

async function markAlertRead(req, res) {
  try {
    const id = Number(req.params.id);

    const alert = await prisma.stockAlert.update({
      where: { id },
      data: { isRead: true },
    });

    res.json(alert);
  } catch (err) {
    res.status(500).json({
      message: "Could not update alert",
      details: err.message,
    });
  }
}

async function updateProduct(req, res) {
  try {
    if (req.user.role !== "ADMIN") {
      return res.status(403).json({ message: "Accès refusé" });
    }

    const id = Number(req.params.id);
    const { price, alertThreshold } = req.body || {};

    const existing = await prisma.inventoryProduct.findUnique({
      where: { id },
    });

    if (!existing) {
      return res.status(404).json({ message: "Produit introuvable" });
    }

    const updated = await prisma.inventoryProduct.update({
      where: { id },
      data: {
        ...(price != null ? { price: Number(price) } : {}),
        ...(alertThreshold != null ? { alertThreshold: Number(alertThreshold) } : {}),
      },
    });

    res.json(updated);
  } catch (err) {
    res.status(500).json({
      message: "Could not update product",
      details: err.message,
    });
  }
}

async function deleteProduct(req, res) {
  try {
    if (req.user.role !== "ADMIN") {
      return res.status(403).json({ message: "Accès refusé" });
    }

    const id = Number(req.params.id);

    const existing = await prisma.inventoryProduct.findUnique({
      where: { id },
      include: { usages: true, alerts: true },
    });

    if (!existing) {
      return res.status(404).json({ message: "Produit introuvable" });
    }

    await prisma.inventoryProduct.delete({
      where: { id },
    });

    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({
      message: "Could not delete product",
      details: err.message,
    });
  }
}

async function uploadInvoiceBackup(req, res) {
  try {
    if (req.user.role !== "ADMIN") {
      return res.status(403).json({ message: "Accès refusé" });
    }

    if (!req.file) {
      return res.status(400).json({ message: "Aucune image envoyée" });
    }

    const amount =
      req.body?.amount !== undefined && String(req.body.amount).trim() !== ""
        ? String(req.body.amount)
        : null;

    const backup = await prisma.stockInvoiceBackup.create({
      data: {
        imageUrl: `/stock-invoices/${req.file.filename}`,
        originalName: req.file.originalname,
        amount,
        uploadedById: req.user.userId,
      },
      include: {
        uploadedBy: {
          select: { id: true, email: true, role: true },
        },
      },
    });

    res.status(201).json(backup);
  } catch (err) {
    res.status(500).json({
      message: "Could not upload invoice backup",
      details: err.message,
    });
  }
}

async function listInvoiceBackups(req, res) {
  try {
    if (req.user.role !== "ADMIN") {
      return res.status(403).json({ message: "Accès refusé" });
    }

    const backups = await prisma.stockInvoiceBackup.findMany({
      orderBy: { createdAt: "desc" },
      include: {
        product: true,
        uploadedBy: {
          select: { id: true, email: true, role: true },
        },
      },
    });

    res.json(backups);
  } catch (err) {
    res.status(500).json({
      message: "Could not load invoice backups",
      details: err.message,
    });
  }
}

module.exports = {
  listProducts,
  createProduct,
  addUsage,
  listAlerts,
  markAlertRead,
  updateProduct,
  deleteProduct,
  uploadInvoiceBackup,
  listInvoiceBackups,
};