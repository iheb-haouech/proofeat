import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";

function renderQr(text: string, size = 280) {
  if (!text) return "";
  const safe = encodeURIComponent(text);
  return `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&data=${safe}`;
}

export default function AttendanceQrDisplayPage() {
  const [params] = useSearchParams();
  const token = params.get("token") || "";
  const expires = params.get("expires") || "";
  const [timeLeft, setTimeLeft] = useState("");

  useEffect(() => {
    if (!expires) return;
    const t = setInterval(() => {
      const diff = new Date(expires).getTime() - Date.now();
      if (diff <= 0) {
        setTimeLeft("Expired");
        clearInterval(t);
        return;
      }
      const m = Math.floor(diff / 60000);
      const s = Math.floor((diff % 60000) / 1000);
      setTimeLeft(`${m}m ${s}s`);
    }, 1000);
    return () => clearInterval(t);
  }, [expires]);

  if (!token) {
    return (
      <div style={{ minHeight: "100vh", display: "grid", placeItems: "center", background: "#0f172a", color: "#fff" }}>
        <div style={{ background: "#111827", padding: 24, borderRadius: 20 }}>
          No token in URL.
        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: "100vh", background: "linear-gradient(180deg,#0f172a 0%, #111827 100%)", display: "grid", placeItems: "center", padding: 24 }}>
      <div style={{ background: "rgba(255,255,255,.98)", borderRadius: 32, padding: 34, display: "grid", placeItems: "center", gap: 18, maxWidth: 520, width: "100%", boxShadow: "0 30px 80px rgba(0,0,0,.35)" }}>
        <div style={{ fontWeight: 900, fontSize: 26 }}>Scanner pour pointer</div>
        <img
          src={renderQr(token)}
          alt="QR code"
          style={{ width: 280, height: 280, borderRadius: 20, border: "10px solid #fff", boxShadow: "0 10px 30px rgba(0,0,0,.10)" }}
        />
        <div style={{ fontFamily: "monospace", wordBreak: "break-all", color: "#64748b", fontSize: 13, textAlign: "center" }}>
          {token}
        </div>
        <div style={{ fontWeight: 900, fontSize: 22, color: timeLeft === "Expired" ? "#b91c1c" : "#047857" }}>
          {timeLeft === "Expired" ? "Session expirée" : `Expire dans ${timeLeft}`}
        </div>
      </div>
    </div>
  );
}