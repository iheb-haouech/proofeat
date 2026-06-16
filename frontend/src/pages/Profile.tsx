import { useEffect, useRef, useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { api } from "../api";
import { useAuth } from "../hooks/useAuth";

export default function Profile() {
  const { user, token, logout } = useAuth();
  const navigate = useNavigate();
  const fileRef = useRef<HTMLInputElement>(null);

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");

  const [profileError, setProfileError] = useState("");
  const [profileSuccess, setProfileSuccess] = useState("");
  const [passwordError, setPasswordError] = useState("");
  const [passwordSuccess, setPasswordSuccess] = useState("");
  const [loading, setLoading] = useState(false);
  const [avatarLoading, setAvatarLoading] = useState(false);

  if (!user || !token) {
    return <Navigate to="/login" replace />;
  }

  useEffect(() => {
    setFirstName(user.firstName || "");
    setLastName(user.lastName || "");
    setName(user.name || "");
    setPhone(user.phone || "");
  }, [user]);

  const handleProfileSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setProfileError("");
    setProfileSuccess("");
    setLoading(true);
    try {
      const res = await api.patch(
        "/users/me/profile",
        { name, firstName, lastName, phone },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setProfileSuccess("Profil mis à jour avec succès");
      const updated = res.data;
      if (updated) {
        const currUser = JSON.parse(localStorage.getItem("user") || "null");
        if (currUser) {
          const merged = { ...currUser, ...updated };
          localStorage.setItem("user", JSON.stringify(merged));
          window.dispatchEvent(new Event("user-updated"));
        }
      }
    } catch (err: any) {
      setProfileError(err?.response?.data?.message || "Impossible de mettre à jour le profil");
    } finally {
      setLoading(false);
    }
  };

  const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setAvatarLoading(true);
    setProfileError("");
    setProfileSuccess("");
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await api.patch("/users/me/profile/avatar", fd, {
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "multipart/form-data" },
      });
      setProfileSuccess("Photo de profil mise à jour");
      const updated = res.data;
      if (updated) {
        const currUser = JSON.parse(localStorage.getItem("user") || "null");
        if (currUser) {
          const merged = { ...currUser, ...updated };
          localStorage.setItem("user", JSON.stringify(merged));
          window.dispatchEvent(new Event("user-updated"));
        }
      }
    } catch (err: any) {
      setProfileError(err?.response?.data?.message || "Impossible de mettre à jour la photo de profil");
    } finally {
      setAvatarLoading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const handlePasswordSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setPasswordError("");
    setPasswordSuccess("");
    if (newPassword !== confirmPassword) {
      setPasswordError("La confirmation du mot de passe ne correspond pas");
      return;
    }
    if (newPassword.length < 8) {
      setPasswordError("Le nouveau mot de passe doit contenir au moins 8 caractères");
      return;
    }
    try {
      setLoading(true);
      await api.patch(
        "/users/me/password",
        { currentPassword, newPassword },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setPasswordSuccess("Mot de passe modifié avec succès");
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch (err: any) {
      setPasswordError(err?.response?.data?.message || "Impossible de modifier le mot de passe");
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = () => {
    logout();
    navigate("/login", { replace: true });
  };

  const avatarSrc = user.avatarUrl
    ? user.avatarUrl.startsWith("http")
      ? user.avatarUrl
      : `${api.defaults.baseURL || "http://localhost:5000"}${user.avatarUrl}`
    : null;

  return (
    <div style={{ maxWidth: 620, margin: "32px auto", padding: 0 }}>
      <h1>Mon profil</h1>
      <p style={{ color: "#64748b", marginTop: -8, marginBottom: 24 }}>
        Gérez vos informations personnelles et votre photo de profil.
      </p>

      {profileError ? <p style={{ color: "red", marginBottom: 8 }}>{profileError}</p> : null}
      {profileSuccess ? <p style={{ color: "green", marginBottom: 8 }}>{profileSuccess}</p> : null}

      <div
        style={{
          display: "grid",
          gap: 24,
        }}
      >
        <section
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
            gap: 20,
            padding: 24,
            border: "1px solid #e2e8f0",
            borderRadius: 12,
          }}
        >
          <form onSubmit={handleProfileSubmit} style={{ display: "grid", gap: 12 }}>
            <h2 style={{ margin: 0, fontSize: 16 }}>Informations personnelles</h2>
            <input
              type="text"
              placeholder="Prénom"
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
            />
            <input
              type="text"
              placeholder="Nom"
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
            />
            <input
              type="text"
              placeholder="Nom d'affichage"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
            <input
              type="tel"
              placeholder="Numéro de téléphone"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
            />
            <button type="submit" disabled={loading} style={{ justifySelf: "start" }}>
              {loading ? "Enregistrement..." : "Enregistrer"}
            </button>
          </form>

          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              gap: 12,
              padding: 16,
              border: "1px solid #e2e8f0",
              borderRadius: 12,
            }}
          >
            <div
              style={{
                width: 110,
                height: 110,
                borderRadius: "50%",
                overflow: "hidden",
                background: "#f1f5f9",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontWeight: 800,
                fontSize: 36,
                color: "#64748b",
                border: "3px solid #e2e8f0",
              }}
            >
              {avatarSrc ? (
                <img
                  src={avatarSrc}
                  alt="Avatar"
                  style={{ width: "100%", height: "100%", objectFit: "cover" }}
                />
              ) : (
                (firstName?.[0] || lastName?.[0] || user.email?.[0] || "?").toUpperCase()
              )}
            </div>
            <input
              ref={fileRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,image/gif"
              style={{ display: "none" }}
              onChange={handleAvatarChange}
            />
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              disabled={avatarLoading}
              style={{ padding: "8px 14px", borderRadius: 8, cursor: "pointer" }}
            >
              {avatarLoading ? "Chargement..." : "Changer la photo"}
            </button>
          </div>
        </section>

        <section
          style={{
            padding: 24,
            border: "1px solid #e2e8f0",
            borderRadius: 12,
          }}
        >
          <form onSubmit={handlePasswordSubmit} style={{ display: "grid", gap: 12, maxWidth: 420 }}>
            <h2 style={{ margin: 0, fontSize: 16 }}>Changer le mot de passe</h2>
            <input
              type="password"
              placeholder="Mot de passe actuel"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              required
            />
            <input
              type="password"
              placeholder="Nouveau mot de passe"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              required
            />
            <input
              type="password"
              placeholder="Confirmer le nouveau mot de passe"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
            />
            <button type="submit" disabled={loading} style={{ justifySelf: "start" }}>
              Mettre à jour le mot de passe
            </button>
            {passwordError ? <p style={{ color: "red" }}>{passwordError}</p> : null}
            {passwordSuccess ? <p style={{ color: "green" }}>{passwordSuccess}</p> : null}
          </form>
        </section>

        <section style={{ padding: "0 24px" }}>
          <button
            onClick={handleLogout}
            style={{
              padding: "10px 18px",
              borderRadius: 10,
              border: 0,
              background: "#ef4444",
              color: "#fff",
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            Déconnexion
          </button>
        </section>
      </div>
    </div>
  );
}
