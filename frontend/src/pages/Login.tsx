import { useState, type FormEvent } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import "../styles/auth.css";

export default function Login() {
  const { login, token, user  } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

if (token) {
  if (user?.role === "SUPERADMIN") {
    return <Navigate to="/superadmin" replace />;
  }
  return <Navigate to="/dashboard" replace />;
}

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const result = await login(email.trim(), password);
      if (result.user.role === "SUPERADMIN") {
          navigate("/superadmin");
        } else {
          navigate("/dashboard");
        }
    } catch (err: unknown) {
      const msg =
        err &&
        typeof err === "object" &&
        "response" in err &&
        err.response &&
        typeof err.response === "object" &&
        "data" in err.response &&
        err.response.data &&
        typeof err.response.data === "object" &&
        "message" in err.response.data
          ? String((err.response.data as { message?: string }).message)
          : "Connexion impossible";
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-page">
      <div className="auth-card">
        <div className="auth-brand">
          <img src="/logo.png" alt="ProofEat" className="auth-logo" />
          <div>
            <h1>ProofEat</h1>
            <p>Preuves de commande Uber Eats</p>
          </div>
        </div>

        <h2>Connexion</h2>
        <p className="auth-sub">Accédez à vos scans et tableaux de bord.</p>

        <form onSubmit={onSubmit}>
          {error ? <div className="auth-error">{error}</div> : null}

          <div className="auth-field">
            <label htmlFor="email">Email</label>
            <input
              id="email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="vous@exemple.fr"
              required
            />
          </div>

          <div className="auth-field">
            <label htmlFor="password">Mot de passe</label>
            <input
              id="password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              required
            />
          </div>

          <button type="submit" className="auth-submit" disabled={loading}>
            {loading ? "Connexion…" : "Se connecter"}
          </button>
        </form>

        <p className="auth-footer">
          Pas encore de compte ? <Link to="/inscription">S&apos;inscrire</Link>
        </p>

        <div className="mobile-download-section">
          <p className="mobile-download-text">Disponible en application mobile :</p>
          <div className="mobile-download-links">
            <a
              href="https://proofeat.cloud/proofeat-android.apk"
              className="mobile-download-btn android"
              target="_blank"
              rel="noopener noreferrer"
            >
              📱 Télécharger Android APK
            </a>
            <a
              href="https://proofeat.cloud/proofeat-ios.ipa"
              className="mobile-download-btn ios"
              target="_blank"
              rel="noopener noreferrer"
            >
              🍏 Télécharger iOS
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
