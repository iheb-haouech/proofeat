import { NavLink, Outlet } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";

export default function MainLayout() {
  const { user, logout } = useAuth();
  const isAdmin = user?.role === "ADMIN" || user?.role === "SUPERADMIN";
  const isClient = user?.role === "CLIENT";

  const displayName = [user?.firstName, user?.lastName].filter(Boolean).join(" ") || user?.name || user?.email || "Utilisateur";
  const welcomeMessage = isAdmin ? `Bienvenue, ${displayName}` : `Bonjour, ${displayName}`;
  const avatarSrc = user?.avatarUrl ? (user.avatarUrl.startsWith("http") ? user.avatarUrl : `${import.meta.env.VITE_API_URL || "http://localhost:5000"}${user.avatarUrl}`) : null;

  const navItem = ({ isActive }: { isActive: boolean }) => ({
    display: "block",
    padding: "12px 14px",
    borderRadius: 12,
    textDecoration: "none",
    color: isActive ? "#fff" : "#cbd5e1",
    background: isActive ? "linear-gradient(135deg,#1d4ed8,#2563eb)" : "transparent",
    fontWeight: 700,
    marginBottom: 8,
  });

  return (
    <>
      <style>{`
        .app-shell {
          min-height: 100vh;
          display: grid;
          grid-template-columns: 260px 1fr;
          background: #f8fafc;
        }
        .app-sidebar {
          background: #0f172a;
          padding: 18px;
          color: #fff;
          position: sticky;
          top: 0;
          height: 100vh;
          overflow-y: auto;
        }
        .app-main {
          padding: 20px;
          min-width: 0;
        }
        .user-card {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 14px 10px;
          margin-bottom: 20px;
          border-bottom: 1px solid #1e293b;
          padding-bottom: 18px;
        }
        .user-avatar {
          width: 42px;
          height: 42px;
          border-radius: 50%;
          object-fit: cover;
          background: #1e293b;
          display: flex;
          align-items: center;
          justify-content: center;
          font-weight: 800;
          font-size: 16px;
          color: #94a3b8;
          overflow: hidden;
          flex-shrink: 0;
        }
        .user-avatar img {
          width: 100%;
          height: 100%;
          object-fit: cover;
        }
        .user-info {
          min-width: 0;
        }
        .user-name {
          font-weight: 700;
          font-size: 14px;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .user-welcome {
          font-size: 12px;
          color: #94a3b8;
          margin-top: 2px;
        }
        @media (max-width: 860px) {
          .app-shell {
            grid-template-columns: 1fr;
          }
          .app-sidebar {
            position: relative;
            height: auto;
          }
          .app-main {
            padding: 12px;
          }
          .app-nav {
            display: grid;
            grid-template-columns: repeat(2, minmax(0, 1fr));
            gap: 8px;
          }
          .app-nav a {
            margin-bottom: 0;
          }
        }
        @media (max-width: 480px) {
          .app-nav {
            grid-template-columns: 1fr;
          }
        }
      `}</style>
      <div className="app-shell">
        <aside className="app-sidebar">
          <img src="/logo.png" alt="ProofEat" style={{ width: 32, height: 32, objectFit: "contain", marginBottom: 6 }} />
          <div style={{ fontSize: 24, fontWeight: 900, marginBottom: 6 }}>ProofEat</div>
          <div className="user-card">
            <div className="user-avatar">
              {avatarSrc ? <img src={avatarSrc} alt="Avatar" /> : displayName.charAt(0).toUpperCase()}
            </div>
            <div className="user-info">
              <div className="user-name">{displayName}</div>
              <div className="user-welcome">{welcomeMessage}</div>
            </div>
          </div>
          <nav className="app-nav">
            <NavLink to="/dashboard" style={navItem}>Tableau de bord</NavLink>
          {isAdmin && <NavLink to="/attendance" style={navItem}>Pointage admin</NavLink>}
          {isAdmin && <NavLink to="/attendance/history" style={navItem}>Historique pointage</NavLink>}
          {isAdmin && <NavLink to="/attendance/kiosk" style={navItem}>QR kiosque</NavLink>}
            {isClient && <NavLink to="/attendance/scan" style={navItem}>Scanner pointage</NavLink>}
            <NavLink to="/proofcam" style={navItem}>ProofCam</NavLink>
            <NavLink to="/orders" style={navItem}>Commandes</NavLink>
            <NavLink to="/inventory" style={navItem}>Inventaire</NavLink>
            <NavLink to="/profile" style={navItem}>Mon profil</NavLink>
          </nav>
          <button
            onClick={logout}
            style={{ marginTop: 20, width: "100%", padding: 12, borderRadius: 12, border: 0, background: "#ef4444", color: "#fff", fontWeight: 800, cursor: "pointer" }}
          >
            Déconnexion
          </button>
        </aside>
        <main className="app-main">
          <Outlet />
        </main>
      </div>
    </>
  );
}