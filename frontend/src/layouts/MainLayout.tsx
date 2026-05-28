import { useState } from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import "./layout.css";

const nav = [
  { to: "/dashboard", label: "Tableau de bord" },
  { to: "/proofcam", label: "Scan ticket" },
  { to: "/orders", label: "Commandes" },
];

export default function MainLayout() {
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);

  const onLogout = () => {
    logout();
    navigate("/login");
  };

  return (
    <div className="app-layout">
      <button
        type="button"
        className="menu-toggle"
        aria-label="Menu"
        onClick={() => setMenuOpen((o) => !o)}
      >
        <span />
        <span />
        <span />
      </button>

      {menuOpen && (
        <button
          type="button"
          className="sidebar-backdrop"
          aria-label="Fermer le menu"
          onClick={() => setMenuOpen(false)}
        />
      )}

      <aside className={`sidebar ${menuOpen ? "open" : ""}`}>
        <div className="sidebar-logo">
          Proof<span>Eat</span>
        </div>

        <nav onClick={() => setMenuOpen(false)}>
          {nav.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) => (isActive ? "nav-link active" : "nav-link")}
            >
              {item.label}
            </NavLink>
          ))}
        </nav>

        <div className="sidebar-footer">
          <p className="user-email">{user?.email}</p>
          <button type="button" className="btn-logout" onClick={onLogout}>
            Déconnexion
          </button>
        </div>
      </aside>

      <main className="main-content">
        <header className="topbar">
          <h3>ProofEat</h3>
          <span className="topbar-user">{user?.email}</span>
        </header>

        <div className="page-content">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
