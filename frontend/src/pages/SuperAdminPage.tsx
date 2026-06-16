import { useEffect, useMemo, useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { api } from "../api";
import { useAuth } from "../hooks/useAuth";

type Role = "SUPERADMIN" | "ADMIN" | "CLIENT";

type UserItem = {
  id: number;
  email: string;
  name?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  phone?: string | null;
  role: Role;
  createdAt: string;
};

type Stats = {
  users: { superAdmins: number; admins: number; clients: number; total: number };
  proofCamScans: number;
  orders: number;
  claims: number;
  inventoryProducts: number;
  attendanceEvents: number;
  attendanceSchedules: number;
  attendanceDayOffs: number;
  notifications: number;
  datasetReleases: number;
  uploadsFileCount: number;
};

export default function SuperAdminPage() {
  const { token, user, logout } = useAuth();
  const navigate = useNavigate();

  const [users, setUsers] = useState<UserItem[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const [form, setForm] = useState({
    email: "",
    password: "",
    firstName: "",
    lastName: "",
    name: "",
    phone: "",
    role: "CLIENT" as "ADMIN" | "CLIENT",
  });

  const [passwordForm, setPasswordForm] = useState({
    currentPassword: "",
    newPassword: "",
    confirmPassword: "",
  });

  const authHeaders = useMemo(
    () => ({
      Authorization: `Bearer ${token}`,
    }),
    [token]
  );

  const loadUsers = async () => {
    try {
      setLoading(true);
      setError("");
      const res = await api.get<UserItem[]>("/users", { headers: authHeaders });
      setUsers(res.data);
    } catch {
      setError("Impossible de charger les utilisateurs");
    } finally {
      setLoading(false);
    }
  };

  const loadStats = async () => {
    try {
      const res = await api.get<Stats>("/users/stats", { headers: authHeaders });
      setStats(res.data);
    } catch {
      // silent
    }
  };

  useEffect(() => {
    if (user?.role === "SUPERADMIN" && token) {
      loadUsers();
      loadStats();
    }
  }, [user?.role, token]);

  const handleCreateUser = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    try {
      setError("");
      setSuccess("");
      await api.post(
        "/users",
        { email: form.email, password: form.password, name: form.name || [form.firstName, form.lastName].filter(Boolean).join(" ") || null, role: form.role, firstName: form.firstName || null, lastName: form.lastName || null, phone: form.phone || null },
        { headers: authHeaders }
      );
      setForm({ email: "", password: "", firstName: "", lastName: "", name: "", phone: "", role: "CLIENT" });
      setSuccess("Utilisateur créé avec succès");
      await loadUsers();
      await loadStats();
    } catch {
      setError("Impossible de créer l'utilisateur");
    }
  };

  const handleRoleChange = async (id: number, role: "ADMIN" | "CLIENT") => {
    try {
      setError("");
      setSuccess("");
      await api.patch(`/users/${id}/role`, { role }, { headers: authHeaders });
      setSuccess("Rôle mis à jour avec succès");
      await loadUsers();
      await loadStats();
    } catch {
      setError("Impossible de modifier le rôle");
    }
  };

  const handlePasswordChange = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError("");
    setPasswordForm({ currentPassword: "", newPassword: "", confirmPassword: "" });
    setSuccess("");

    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      setError("La confirmation du mot de passe ne correspond pas");
      return;
    }

    if (passwordForm.newPassword.length < 8) {
      setError("Le nouveau mot de passe doit contenir au moins 8 caractères");
      return;
    }

    try {
      await api.patch(
        "/users/me/password",
        { currentPassword: passwordForm.currentPassword, newPassword: passwordForm.newPassword },
        { headers: authHeaders }
      );
      setPasswordForm({ currentPassword: "", newPassword: "", confirmPassword: "" });
      setSuccess("Mot de passe modifié avec succès");
    } catch {
      setError("Impossible de modifier le mot de passe");
    }
  };

  const handleLogout = () => {
    logout();
    navigate("/login", { replace: true });
  };

  if (!token || !user) {
    return <Navigate to="/login" replace />;
  }

  if (user.role !== "SUPERADMIN") {
    return <Navigate to="/dashboard" replace />;
  }

  const statCards = stats
    ? [
        { label: "Utilisateurs", value: stats.users.total, sub: `${stats.users.admins} admins, ${stats.users.clients} clients, ${stats.users.superAdmins} superadmins` },
        { label: "Scans ProofCam", value: stats.proofCamScans },
        { label: "Commandes", value: stats.orders },
        { label: "Réclamations", value: stats.claims },
        { label: "Produits inventaire", value: stats.inventoryProducts },
        { label: "Événements pointage", value: stats.attendanceEvents },
        { label: "Schedules", value: stats.attendanceSchedules },
        { label: "Jours off", value: stats.attendanceDayOffs },
        { label: "Notifications", value: stats.notifications },
        { label: "Datasets", value: stats.datasetReleases },
        { label: "Fichiers uploads", value: stats.uploadsFileCount },
      ]
    : [];

  return (
    <div style={{ padding: 24, maxWidth: 1200, margin: "0 auto", background: "#0a0a0a", minHeight: "100vh" }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 24,
          gap: 16,
          flexWrap: "wrap",
        }}
      >
        <div>
          <h1 style={{ color: "#ffffff", margin: 0 }}>Superadmin</h1>
          <p style={{ color: "#94a3b8" }}>Espace de gestion globale — statistiques et utilisateurs.</p>
        </div>
        <button
          onClick={handleLogout}
          style={{ padding: "10px 14px", borderRadius: 8, border: 0, background: "#ef4444", color: "#fff", fontWeight: 700, cursor: "pointer" }}
        >
          Déconnexion
        </button>
      </div>

      {error ? <p style={{ color: "#ef4444", marginBottom: 8 }}>{error}</p> : null}
      {success ? <p style={{ color: "#22c55e", marginBottom: 8 }}>{success}</p> : null}

      {stats && (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))",
            gap: 14,
            marginBottom: 32,
          }}
        >
          {statCards.map((card) => (
            <div
              key={card.label}
              style={{
                padding: 18,
                borderRadius: 12,
                border: "1px solid #333",
                background: "#1a1a1a",
              }}
            >
              <div style={{ fontSize: 12, color: "#d4ff00", fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.5 }}>
                {card.label}
              </div>
              <div style={{ fontSize: 28, fontWeight: 900, marginTop: 4, color: "#ffffff" }}>{card.value}</div>
              {"sub" in card && card.sub ? (
                <div style={{ fontSize: 12, color: "#94a3b8", marginTop: 4 }}>{card.sub}</div>
              ) : null}
            </div>
          ))}
        </div>
      )}

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
          gap: 24,
          marginBottom: 32,
        }}
      >
        <form
          onSubmit={handleCreateUser}
          style={{
            display: "grid",
            gap: 12,
            padding: 20,
            border: "1px solid #333",
            borderRadius: 12,
            background: "#1a1a1a",
          }}
        >
          <h2 style={{ margin: 0, fontSize: 16, color: "#ffffff" }}>Créer un utilisateur</h2>
          <input
            type="text"
            placeholder="Prénom"
            value={form.firstName}
            onChange={(e) => setForm({ ...form, firstName: e.target.value })}
            style={{ padding: 10, borderRadius: 8, border: "1px solid #333", background: "#0a0a0a", color: "#ffffff" }}
          />
          <input
            type="text"
            placeholder="Nom"
            value={form.lastName}
            onChange={(e) => setForm({ ...form, lastName: e.target.value })}
            style={{ padding: 10, borderRadius: 8, border: "1px solid #333", background: "#0a0a0a", color: "#ffffff" }}
          />
          <input
            type="email"
            placeholder="Email"
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
            required
            style={{ padding: 10, borderRadius: 8, border: "1px solid #333", background: "#0a0a0a", color: "#ffffff" }}
          />
          <input
            type="password"
            placeholder="Mot de passe"
            value={form.password}
            onChange={(e) => setForm({ ...form, password: e.target.value })}
            required
            style={{ padding: 10, borderRadius: 8, border: "1px solid #333", background: "#0a0a0a", color: "#ffffff" }}
          />
          <input
            type="tel"
            placeholder="Téléphone"
            value={form.phone}
            onChange={(e) => setForm({ ...form, phone: e.target.value })}
            style={{ padding: 10, borderRadius: 8, border: "1px solid #333", background: "#0a0a0a", color: "#ffffff" }}
          />
          <select
            value={form.role}
            onChange={(e) => setForm({ ...form, role: e.target.value as "ADMIN" | "CLIENT" })}
            style={{ padding: 10, borderRadius: 8, border: "1px solid #333", background: "#0a0a0a", color: "#ffffff" }}
          >
            <option value="CLIENT">CLIENT</option>
            <option value="ADMIN">ADMIN</option>
          </select>
          <button type="submit" style={{ justifySelf: "start", padding: 12, borderRadius: 8, border: 0, background: "linear-gradient(135deg,#d4ff00,#a8e600)", color: "#0a0a0a", fontWeight: 700, cursor: "pointer" }}>
            Créer le compte
          </button>
        </form>

        <form
          onSubmit={handlePasswordChange}
          style={{
            display: "grid",
            gap: 12,
            padding: 20,
            border: "1px solid #333",
            borderRadius: 12,
            background: "#1a1a1a",
          }}
        >
          <h2 style={{ margin: 0, fontSize: 16, color: "#ffffff" }}>Changer mon mot de passe</h2>
          <input
            type="password"
            placeholder="Mot de passe actuel"
            value={passwordForm.currentPassword}
            onChange={(e) => setPasswordForm({ ...passwordForm, currentPassword: e.target.value })}
            required
            style={{ padding: 10, borderRadius: 8, border: "1px solid #333", background: "#0a0a0a", color: "#ffffff" }}
          />
          <input
            type="password"
            placeholder="Nouveau mot de passe"
            value={passwordForm.newPassword}
            onChange={(e) => setPasswordForm({ ...passwordForm, newPassword: e.target.value })}
            required
            style={{ padding: 10, borderRadius: 8, border: "1px solid #333", background: "#0a0a0a", color: "#ffffff" }}
          />
          <input
            type="password"
            placeholder="Confirmer le nouveau mot de passe"
            value={passwordForm.confirmPassword}
            onChange={(e) => setPasswordForm({ ...passwordForm, confirmPassword: e.target.value })}
            required
            style={{ padding: 10, borderRadius: 8, border: "1px solid #333", background: "#0a0a0a", color: "#ffffff" }}
          />
          <button type="submit" style={{ justifySelf: "start", padding: 12, borderRadius: 8, border: 0, background: "linear-gradient(135deg,#d4ff00,#a8e600)", color: "#0a0a0a", fontWeight: 700, cursor: "pointer" }}>
            Mettre à jour
          </button>
        </form>
      </div>

      <div
        style={{
          padding: 20,
          border: "1px solid #333",
          borderRadius: 12,
          background: "#1a1a1a",
          overflowX: "auto",
          color: "#ffffff",
        }}
      >
        <h2 style={{ marginTop: 0, marginBottom: 16, fontSize: 16, color: "#d4ff00" }}>Utilisateurs</h2>
        {loading ? (
          <p style={{ color: "#ffffff" }}>Chargement...</p>
        ) : (
          <table width="100%" cellPadding={10} style={{ borderCollapse: "collapse", fontSize: 14 }}>
            <thead>
              <tr style={{ borderBottom: "2px solid #333" }}>
                <th align="left" style={{ color: "#d4ff00" }}>Nom complet</th>
                <th align="left" style={{ color: "#d4ff00" }}>Email</th>
                <th align="left" style={{ color: "#d4ff00" }}>Prénom</th>
                <th align="left" style={{ color: "#d4ff00" }}>Téléphone</th>
                <th align="left" style={{ color: "#d4ff00" }}>Rôle</th>
                <th align="left" style={{ color: "#d4ff00" }}>Créé le</th>
                <th align="left" style={{ color: "#d4ff00" }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {users.map((item) => (
                <tr key={item.id} style={{ borderBottom: "1px solid #333" }}>
                  <td style={{ color: "#ffffff" }}>{item.name || [item.firstName, item.lastName].filter(Boolean).join(" ") || "-"}</td>
                  <td style={{ color: "#ffffff" }}>{item.email}</td>
                  <td style={{ color: "#ffffff" }}>{item.firstName || "-"}</td>
                  <td style={{ color: "#ffffff" }}>{item.phone || "-"}</td>
                  <td>
                    <span
                      style={{
                        padding: "3px 8px",
                        borderRadius: 6,
                        fontSize: 12,
                        fontWeight: 700,
                        background: item.role === "SUPERADMIN" ? "rgba(212, 255, 0, 0.15)" : item.role === "ADMIN" ? "rgba(212, 255, 0, 0.2)" : "rgba(148, 163, 184, 0.1)",
                        color: item.role === "SUPERADMIN" ? "#d4ff00" : item.role === "ADMIN" ? "#d4ff00" : "#94a3b8",
                      }}
                    >
                      {item.role}
                    </span>
                  </td>
                  <td style={{ fontSize: 12, color: "#94a3b8" }}>{item.createdAt ? new Date(item.createdAt).toLocaleDateString("fr-FR") : "-"}</td>
                  <td>
                    {item.role !== "SUPERADMIN" ? (
                      <select
                        value={item.role}
                        onChange={(e) => handleRoleChange(item.id, e.target.value as "ADMIN" | "CLIENT")}
                        style={{ padding: 4, borderRadius: 6, border: "1px solid #333", background: "#0a0a0a", color: "#ffffff" }}
                      >
                        <option value="CLIENT">CLIENT</option>
                        <option value="ADMIN">ADMIN</option>
                      </select>
                    ) : (
                      <span style={{ color: "#94a3b8" }}>Protégé</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
