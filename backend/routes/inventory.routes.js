const express = require("express");
const router = express.Router();
const controller = require("../controllers/inventory.controller");
const { requireAuth } = require("../middleware/auth");

// Products
router.get("/products", requireAuth, controller.listProducts);
router.post("/products", requireAuth, controller.createProduct);
router.patch("/products/:id", requireAuth, controller.updateProduct);
router.delete("/products/:id", requireAuth, controller.deleteProduct);

// Usage
router.post("/usage", requireAuth, controller.addUsage);

// Alerts
router.get("/alerts", requireAuth, controller.listAlerts);
router.post("/alerts/:id/read", requireAuth, controller.markAlertRead);

// Invoice backups
router.get("/invoice-backups", requireAuth, controller.listInvoiceBackups);

module.exports = router;