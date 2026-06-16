import { useEffect, useMemo, useRef, useState } from "react";
import { Navigate } from "react-router-dom";
import { api } from "../api";
import { useAuth } from "../hooks/useAuth";

type KioskState = {
  active: boolean;
  restaurantOpen?: boolean;
  timeLeftSeconds?: number;
  restaurantHours?: {
    id: number;
    name: string;
    openDays: number[];
    openTime: string;
    closeTime: string;
    isActive: boolean;
  } | null;
  session?: {
    id: number;
    token: string;
    openedAt: string;
    expiresAt: string;
    isOpen: boolean;
    manualOpen: boolean;
  } | null;
};

export default function AttendanceKioskPage() {
  const { user } = useAuth();
  const [state, setState] = useState<KioskState | null>(null);
  const [loading, setLoading] = useState(true);
  const [tick, setTick] = useState(0);
  const [timeLeft, setTimeLeft] = useState(0);
  const lastTokenRef = useRef("");

  const load = async () => {
    setLoading(true);
    try {
      const res = await api.get("/attendance/kiosk");
      const data = res.data || null;
      setState(data);

      if (data?.session?.token) {
        lastTokenRef.current = data.session.token;
        setTimeLeft(data.timeLeftSeconds || 0);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [tick]);

  useEffect(() => {
    const id = setInterval(() => {
      setTick((v) => v + 1);
    }, 10 * 1000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    const countdown = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          setTick((v) => v + 1);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(countdown);
  }, []);

  const tokenToShow = state?.session?.token || lastTokenRef.current;

  const qrUrl = useMemo(() => {
    if (!tokenToShow) return "";
    return `https://api.qrserver.com/v1/create-qr-code/?size=320x320&data=${encodeURIComponent(tokenToShow)}`;
  }, [tokenToShow]);

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${String(s).padStart(2, "0")}`;
  };

  if (!user || user.role === "CLIENT") {
    return <Navigate to="/attendance/scan" replace />;
  }

  return (
    <div className="kiosk-page">
      <style>{`
        .kiosk-page {
          min-height: 100vh;
          background:
            radial-gradient(circle at top left, rgba(37,99,235,.22), transparent 30%),
            radial-gradient(circle at bottom right, rgba(16,185,129,.18), transparent 30%),
            linear-gradient(135deg, #0f172a, #111827);
          color: #fff;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 24px;
          font-family: Inter, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        }
        .kiosk-card {
          width: min(100%, 760px);
          background: rgba(17,24,39,.88);
          border: 1px solid rgba(255,255,255,.14);
          border-radius: 32px;
          padding: clamp(20px, 4vw, 42px);
          text-align: center;
          box-shadow: 0 30px 90px rgba(0,0,0,.45);
          backdrop-filter: blur(18px);
        }
        .kiosk-card h1 {
          margin: 0;
          font-size: clamp(30px, 6vw, 54px);
          letter-spacing: -1.5px;
        }
        .kiosk-card p {
          color: #cbd5e1;
          line-height: 1.55;
        }
        .qr-wrap {
          margin: 24px auto 0;
          width: min(360px, 78vw);
          background: #fff;
          border-radius: 28px;
          padding: 18px;
          box-shadow: 0 24px 60px rgba(0,0,0,.35);
        }
        .qr-wrap img {
          width: 100%;
          height: auto;
          display: block;
          border-radius: 18px;
        }
        .timer {
          margin-top: 18px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          min-width: 120px;
          padding: 10px 16px;
          border-radius: 999px;
          background: rgba(255,255,255,.12);
          color: #fff;
          font-weight: 900;
          letter-spacing: .5px;
        }
        .token {
          margin-top: 12px;
          word-break: break-all;
          color: #94a3b8;
          font-size: 12px;
        }
        @media (max-width: 640px) {
          .kiosk-page {
            padding: 12px;
            align-items: flex-start;
          }
          .kiosk-card {
            border-radius: 24px;
          }
          .qr-wrap {
            border-radius: 22px;
            padding: 12px;
          }
        }
      `}</style>

      <div className="kiosk-card">
        <h1>QR de pointage</h1>
        {loading && <p>Chargement du QR...</p>}

        {!loading && tokenToShow && (
          <>
            <div className="qr-wrap">
              <img src={qrUrl} alt="QR code attendance" />
            </div>
            <p style={{ marginTop: 20, fontSize: 16 }}>
              {state?.restaurantOpen ? "QR actif. Il se renouvelle automatiquement toutes les 30 minutes." : "Restaurant fermé. Le QR reste affiché jusqu'à expiration."}
            </p>
            <div className="timer">⏳ {formatTime(timeLeft)}</div>
            <div className="token">{tokenToShow}</div>
          </>
        )}

        {!loading && !tokenToShow && <p>Aucune session QR active.</p>}
      </div>
    </div>
  );
}
