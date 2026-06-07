import { useEffect, useMemo, useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { api } from "../api";
import { useAuth } from "../hooks/useAuth";

type Role = "SUPERADMIN" | "ADMIN" | "CLIENT";

type UserItem = {
  id: number;
  email: string;
  name?: string | null;
  role: Role;
};

type CreateUserForm = {
  email: string;
  password: string;
  name: string;
  role: "ADMIN" | "CLIENT";
};

export default function SuperAdminPage() {
  const { token, user, logout } = useAuth();
  const navigate = useNavigate();

  const [users, setUsers] = useState<UserItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const [form, setForm] = useState<CreateUserForm>({
    email: "",
    password: "",
    name: "",
    role: "CLIENT",
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
      const res = await api.get<UserItem[]>("/users", {
        headers: authHeaders,
      });
      setUsers(res.data);
    } catch {
      setError("Impossible de charger les utilisateurs");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (user?.role === "SUPERADMIN" && token) {
      loadUsers();
    }
  }, [user?.role, token]);

  const handleCreateUser = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    try {
      setError("");
      setSuccess("");
      await api.post("/users", form, {
        headers: authHeaders,
      });
      setForm({
        email: "",
        password: "",
        name: "",
        role: "CLIENT",
      });
      setSuccess("Utilisateur créé avec succès");
      await loadUsers();
    } catch {
      setError("Impossible de créer l'utilisateur");
    }
  };

  const handleRoleChange = async (id: number, role: "ADMIN" | "CLIENT") => {
    try {
      setError("");
      setSuccess("");
      await api.patch(
        `/users/${id}/role`,
        { role },
        {
          headers: authHeaders,
        }
      );
      setSuccess("Rôle mis à jour avec succès");
      await loadUsers();
    } catch {
      setError("Impossible de modifier le rôle");
    }
  };

  const handlePasswordChange = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError("");
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
        {
          currentPassword: passwordForm.currentPassword,
          newPassword: passwordForm.newPassword,
        },
        {
          headers: authHeaders,
        }
      );

      setPasswordForm({
        currentPassword: "",
        newPassword: "",
        confirmPassword: "",
      });

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

  return (
    <div style={{ padding: 24, maxWidth: 1100, margin: "0 auto" }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 24,
          gap: 16,
        }}
      >
        <div>
          <h1>Superadmin</h1>
          <p>Espace de gestion des utilisateurs et du compte superadmin.</p>
        </div>

        <button onClick={handleLogout} style={{ padding: "10px 14px" }}>
          Déconnexion
        </button>
      </div>

      {error ? <p style={{ color: "red" }}>{error}</p> : null}
      {success ? <p style={{ color: "green" }}>{success}</p> : null}

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
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
            border: "1px solid #ddd",
            borderRadius: 12,
          }}
        >
          <h2>Créer un utilisateur</h2>

          <input
            type="text"
            placeholder="Nom"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
          />

          <input
            type="email"
            placeholder="Email"
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
            required
          />

          <input
            type="password"
            placeholder="Mot de passe"
            value={form.password}
            onChange={(e) => setForm({ ...form, password: e.target.value })}
            required
          />

          <select
            value={form.role}
            onChange={(e) =>
              setForm({ ...form, role: e.target.value as "ADMIN" | "CLIENT" })
            }
          >
            <option value="CLIENT">CLIENT</option>
            <option value="ADMIN">ADMIN</option>
          </select>

          <button type="submit">Créer le compte</button>
        </form>

        <form
          onSubmit={handlePasswordChange}
          style={{
            display: "grid",
            gap: 12,
            padding: 20,
            border: "1px solid #ddd",
            borderRadius: 12,
          }}
        >
          <h2>Changer mon mot de passe</h2>

          <input
            type="password"
            placeholder="Mot de passe actuel"
            value={passwordForm.currentPassword}
            onChange={(e) =>
              setPasswordForm({
                ...passwordForm,
                currentPassword: e.target.value,
              })
            }
            required
          />

          <input
            type="password"
            placeholder="Nouveau mot de passe"
            value={passwordForm.newPassword}
            onChange={(e) =>
              setPasswordForm({
                ...passwordForm,
                newPassword: e.target.value,
              })
            }
            required
          />

          <input
            type="password"
            placeholder="Confirmer le nouveau mot de passe"
            value={passwordForm.confirmPassword}
            onChange={(e) =>
              setPasswordForm({
                ...passwordForm,
                confirmPassword: e.target.value,
              })
            }
            required
          />

          <button type="submit">Mettre à jour le mot de passe</button>
        </form>
      </div>

      <div
        style={{
          padding: 20,
          border: "1px solid #ddd",
          borderRadius: 12,
          overflowX: "auto",
        }}
      >
        <h2 style={{ marginBottom: 16 }}>Utilisateurs</h2>

        {loading ? (
          <p>Chargement...</p>
        ) : (
          <table width="100%" cellPadding={10} style={{ borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th align="left">Nom</th>
                <th align="left">Email</th>
                <th align="left">Rôle</th>
                <th align="left">Action</th>
              </tr>
            </thead>
            <tbody>
              {users.map((item) => (
                <tr key={item.id}>
                  <td>{item.name || "-"}</td>
                  <td>{item.email}</td>
                  <td>{item.role}</td>
                  <td>
                    {item.role !== "SUPERADMIN" ? (
                      <select
                        value={item.role}
                        onChange={(e) =>
                          handleRoleChange(
                            item.id,
                            e.target.value as "ADMIN" | "CLIENT"
                          )
                        }
                      >
                        <option value="CLIENT">CLIENT</option>
                        <option value="ADMIN">ADMIN</option>
                      </select>
                    ) : (
                      "Protégé"
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