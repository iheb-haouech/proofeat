const express = require("express");
const bcrypt = require("bcrypt");
const { PrismaClient } = require("@prisma/client");
const authorizeRoles = require("../middleware/authorizeRoles");

const prisma = new PrismaClient();
const router = express.Router();

// use your existing auth middleware here
const { requireAuth } = require("../middleware/auth");

// SUPERADMIN: list all users
router.get(
  "/",
  requireAuth,
  authorizeRoles("SUPERADMIN"),
  async (req, res) => {
    try {
      const users = await prisma.user.findMany({
        select: {
          id: true,
          email: true,
          name: true,
          role: true,
          createdAt: true,
        },
        orderBy: { createdAt: "desc" },
      });

      res.json(users);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch users" });
    }
  }
);

// SUPERADMIN: create user
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
        select: {
          id: true,
          email: true,
          name: true,
          role: true,
          createdAt: true,
        },
      });

      res.status(201).json(user);
    } catch (error) {
      res.status(500).json({ message: "Failed to create user" });
    }
  }
);

// SUPERADMIN: change role
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
        select: {
          id: true,
          email: true,
          name: true,
          role: true,
        },
      });

      res.json(user);
    } catch (error) {
      res.status(500).json({ message: "Failed to update role" });
    }
  }
);

// USER: update own profile
router.patch(
  "/me/profile",
  requireAuth,
  async (req, res) => {
    try {
      const { name, email } = req.body;

      const updatedUser = await prisma.user.update({
        where: { id: req.user.id },
        data: {
          name,
          email,
        },
        select: {
          id: true,
          email: true,
          name: true,
          role: true,
        },
      });

      res.json(updatedUser);
    } catch (error) {
      res.status(500).json({ message: "Failed to update profile" });
    }
  }
);

// USER: change own password
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