const express = require("express");
const bcrypt = require("bcrypt");
const multer = require("multer");
const { PrismaClient } = require("@prisma/client");
const fs = require("fs");
const path = require("path");
const authorizeRoles = require("../middleware/authorizeRoles");

const prisma = new PrismaClient();
const router = express.Router();

const { requireAuth } = require("../middleware/auth");

const userSelect = {
  id: true,
  email: true,
  name: true,
  firstName: true,
  lastName: true,
  phone: true,
  avatarUrl: true,
  role: true,
  createdAt: true,
  updatedAt: true,
};

const profileStorage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, path.join(__dirname, "..", "uploads", "profiles")),
  filename: (_req, file, cb) => {
    const safe = (file.originalname || "avatar.jpg").replace(/[^\w.\-]+/g, "_");
    cb(null, `${Date.now()}-${safe}`);
  },
});

const profileUpload = multer({
  storage: profileStorage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = ["image/jpeg", "image/png", "image/webp", "image/gif"];
    if (allowed.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error("Invalid image type"));
    }
  },
});

router.get("/me", requireAuth, async (req, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: userSelect,
    });

    res.json(user);
  } catch (error) {
    res.status(500).json({ message: "Failed to fetch profile" });
  }
});

router.patch(
  "/me/profile",
  requireAuth,
  async (req, res) => {
    try {
      const { name, firstName, lastName, phone } = req.body;

      const updatedUser = await prisma.user.update({
        where: { id: req.user.id },
        data: {
          name,
          firstName,
          lastName,
          phone,
        },
        select: userSelect,
      });

      res.json(updatedUser);
    } catch (error) {
      res.status(500).json({ message: "Failed to update profile" });
    }
  }
);

router.patch(
  "/me/profile/avatar",
  requireAuth,
  profileUpload.single("file"),
  async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ message: "No image uploaded" });
      }

      const avatarUrl = `/uploads/profiles/${req.file.filename}`;

      const updatedUser = await prisma.user.update({
        where: { id: req.user.id },
        data: { avatarUrl },
        select: userSelect,
      });

      res.json(updatedUser);
    } catch (error) {
      res.status(500).json({ message: "Failed to update avatar" });
    }
  }
);

router.get(
  "/",
  requireAuth,
  authorizeRoles("SUPERADMIN"),
  async (req, res) => {
    try {
      const users = await prisma.user.findMany({
        select: userSelect,
        orderBy: { createdAt: "desc" },
      });

      res.json(users);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch users" });
    }
  }
);

router.post(
  "/",
  requireAuth,
  authorizeRoles("SUPERADMIN"),
  async (req, res) => {
    try {
      const { email, password, name, role } = req.body;

      if (!email || !password || !role) {
        return res.status(400).json({ message: "email, password and role are required" });
      }

      if (!["ADMIN", "CLIENT"].includes(role)) {
        return res.status(400).json({ message: "role must be ADMIN or CLIENT" });
      }

      const existing = await prisma.user.findUnique({
        where: { email },
      });

      if (existing) {
        return res.status(409).json({ message: "User already exists" });
      }

      const hashedPassword = await bcrypt.hash(password, 10);

      const user = await prisma.user.create({
        data: {
          email,
          password: hashedPassword,
          name: name || null,
          role,
        },
        select: userSelect,
      });

      res.status(201).json(user);
    } catch (error) {
      res.status(500).json({ message: "Failed to create user" });
    }
  }
);

router.patch(
  "/:id/role",
  requireAuth,
  authorizeRoles("SUPERADMIN"),
  async (req, res) => {
    try {
      const userId = Number(req.params.id);
      const { role } = req.body;

      if (!["ADMIN", "CLIENT"].includes(role)) {
        return res.status(400).json({ message: "role must be ADMIN or CLIENT" });
      }

      const user = await prisma.user.update({
        where: { id: userId },
        data: { role },
        select: userSelect,
      });

      res.json(user);
    } catch (error) {
      res.status(500).json({ message: "Failed to update role" });
    }
  }
);

router.get(
  "/stats",
  requireAuth,
  authorizeRoles("SUPERADMIN"),
  async (_req, res) => {
    try {
      const uploadsDir = path.join(__dirname, "..", "uploads");
      let uploadFileCount = 0;

      try {
        uploadFileCount = fs.readdirSync(uploadsDir).filter((file) => {
          const fullPath = path.join(uploadsDir, file);
          return fs.statSync(fullPath).isFile();
        }).length;
      } catch (err) {
        uploadFileCount = 0;
      }

      const [
        superAdmins,
        admins,
        clients,
        proofCamScans,
        orders,
        claims,
        inventoryProducts,
        attendanceEvents,
        attendanceSchedules,
        attendanceDayOffs,
        notifications,
        datasetReleases,
      ] = await Promise.all([
        prisma.user.count({ where: { role: "SUPERADMIN" } }),
        prisma.user.count({ where: { role: "ADMIN" } }),
        prisma.user.count({ where: { role: "CLIENT" } }),
        prisma.proofCamScan.count(),
        prisma.order.count(),
        prisma.claim.count(),
        prisma.inventoryProduct.count(),
        prisma.attendanceEvent.count(),
        prisma.attendanceSchedule.count(),
        prisma.attendanceDayOff.count(),
        prisma.notification.count(),
        prisma.datasetRelease.count(),
      ]);

      res.json({
        users: { superAdmins, admins, clients, total: superAdmins + admins + clients },
        proofCamScans,
        orders,
        claims,
        inventoryProducts,
        attendanceEvents,
        attendanceSchedules,
        attendanceDayOffs,
        notifications,
        datasetReleases,
        uploadsFileCount: uploadFileCount,
      });
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch stats" });
    }
  }
);

router.patch(
  "/me/password",
  requireAuth,
  async (req, res) => {
    try {
      const { currentPassword, newPassword } = req.body;

      if (!currentPassword || !newPassword) {
        return res.status(400).json({ message: "currentPassword and newPassword are required" });
      }

      const user = await prisma.user.findUnique({
        where: { id: req.user.id },
      });

      const isMatch = await bcrypt.compare(currentPassword, user.password);

      if (!isMatch) {
        return res.status(400).json({ message: "Current password is incorrect" });
      }

      const hashedPassword = await bcrypt.hash(newPassword, 10);

      await prisma.user.update({
        where: { id: req.user.id },
        data: { password: hashedPassword },
      });

      res.json({ message: "Password updated successfully" });
    } catch (error) {
      res.status(500).json({ message: "Failed to update password" });
    }
  }
);

module.exports = router;