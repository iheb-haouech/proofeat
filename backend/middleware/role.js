function normalizeRole(role) {
  return String(role || "").toUpperCase();
}

function requireAdmin(req, res, next) {
  const role = normalizeRole(req.user?.role);
  if (role === "ADMIN" || role === "SUPERADMIN") {
    return next();
  }
  return res.status(403).json({ message: "Accès réservé aux administrateurs" });
}

module.exports = { requireAdmin };