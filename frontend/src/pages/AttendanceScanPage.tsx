import { useEffect, useRef, useState } from "react";
import { BrowserQRCodeReader } from "@zxing/browser";
import type { IScannerControls } from "@zxing/browser";
import { api } from "../api";

type ScanResult = {
  ok: boolean;
  decision?: string;
  event?: any;
  message?: string;
  failures?: string[];
  checks?: {
    qrValid?: boolean;
    agendaFits?: boolean;
    noSchedule?: boolean;
    breakMinimum?: string;
    breakDuration?: string;
  };
};

const eventMeta: Record<string, { title: string; color: string; text: string }> = {
  CHECK_IN: {
    title: "Check-in",
    color: "#16a34a",
    text: "Bien arrivé. Bonne journée de travail !",
  },
  BREAK_START: {
    title: "Début pause",
    color: "#f97316",
    text: "Pause lancée.",
  },
  BREAK_END: {
    title: "Retour de pause",
    color: "#2563eb",
    text: "Retour en mode action.",
  },
  CHECK_OUT: {
    title: "Check-out",
    color: "#7c3aed",
    text: "Fin de service enregistrée. Bon repos !",
  },
};

export default function AttendanceScanPage() {
  const [eventType, setEventType] = useState("CHECK_IN");
  const [token, setToken] = useState("");
  const [scanning, setScanning] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [result, setResult] = useState<ScanResult | null>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const controlsRef = useRef<IScannerControls | null>(null);

  const meta = eventMeta[eventType] || eventMeta.CHECK_IN;

  const submit = async () => {
    if (!token.trim()) {
      setMessage("Scanne le QR ou colle le token du QR.");
      return;
    }

    setBusy(true);
    setMessage(null);
    setResult(null);
    try {
      const res = await api.post("/attendance/kiosk/scan", {
        eventType,
        qrToken: token.trim(),
      });
      setResult(res.data);
      setMessage(res.data?.decision === "ACCEPTED" ? meta.title : `Pointage enregistré: ${res.data?.decision}`);
      setToken("");
    } catch (e: any) {
      setResult(e?.response?.data || null);
      setMessage(e?.response?.data?.message || "Pointage refusé");
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    if (!message) return;
    const id = window.setTimeout(() => {
      setMessage(null);
      setResult(null);
    }, 7000);
    return () => window.clearTimeout(id);
  }, [message]);

  useEffect(() => {
    let codeReader: BrowserQRCodeReader | null = null;
    let cancelled = false;

    const start = async () => {
      try {
        codeReader = new BrowserQRCodeReader();
        setScanning(true);
        const controls = await codeReader.decodeFromVideoDevice(undefined, "qr-video", (decoded, error) => {
          if (cancelled) return;
          if (decoded) {
            const value = decoded.getText();
            const extracted = value.includes("token=")
              ? new URLSearchParams(value.split("?").pop() || value).get("token") || value
              : value;
            setToken(extracted);
            setScanning(false);
            controlsRef.current?.stop();
          }
          if (error && !decoded) {
            setCameraError("Place le QR dans le cadre.");
          }
        });
        controlsRef.current = controls;
      } catch (e: any) {
        setScanning(false);
        setCameraError(e?.message || "Caméra indisponible. Colle le token du QR.");
      }
    };

    start();

    return () => {
      cancelled = true;
      controlsRef.current?.stop();
    };
  }, []);

  const success = result?.ok && !result?.message?.toLowerCase().includes("refus");
  const warning = result && !success;
  const details = result?.checks || result?.failures?.length ? result : null;

  return (
    <div className="scan-page">
      <style>{`
        :root { color-scheme: light; }
        .scan-page {
          min-height: 100vh;
          padding: 20px;
          background:
            radial-gradient(circle at top left, rgba(59,130,246,.22), transparent 34%),
            radial-gradient(circle at bottom right, rgba(16,185,129,.20), transparent 32%),
            linear-gradient(135deg, #eef2ff 0%, #f8fafc 45%, #ecfeff 100%);
          display: flex;
          align-items: center;
          justify-content: center;
          font-family: Inter, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        }
        .scan-card {
          width: min(100%, 920px);
          display: grid;
          grid-template-columns: 1.05fr .95fr;
          gap: 20px;
          background: rgba(255,255,255,.92);
          border: 1px solid rgba(255,255,255,.7);
          border-radius: 30px;
          padding: 24px;
          box-shadow: 0 30px 80px rgba(15,23,42,.14);
          backdrop-filter: blur(18px);
        }
        .scan-hero, .scan-panel {
          border-radius: 24px;
          padding: 22px;
        }
        .scan-hero {
          color: #fff;
          background: linear-gradient(135deg, #0f172a, #1d4ed8 55%, #06b6d4);
          display: flex;
          flex-direction: column;
          justify-content: space-between;
          min-height: 520px;
          position: relative;
          overflow: hidden;
        }
        .scan-hero:before {
          content: "";
          position: absolute;
          width: 260px;
          height: 260px;
          border-radius: 999px;
          right: -90px;
          top: -80px;
          background: rgba(255,255,255,.16);
        }
        .scan-hero h1 {
          margin: 0;
          font-size: clamp(28px, 5vw, 48px);
          line-height: 1.02;
          letter-spacing: -1.4px;
          position: relative;
        }
        .scan-hero p {
          margin: 14px 0 0;
          color: rgba(255,255,255,.82);
          line-height: 1.55;
          position: relative;
        }
        .camera-box {
          margin-top: 24px;
          background: #020617;
          border-radius: 26px;
          min-height: 320px;
          overflow: hidden;
          border: 3px solid rgba(255,255,255,.22);
          box-shadow: inset 0 0 0 999px rgba(15,23,42,.12);
          position: relative;
        }
        .camera-box video {
          width: 100%;
          height: 100%;
          min-height: 320px;
          object-fit: cover;
          display: block;
        }
        .camera-frame {
          position: absolute;
          inset: 34px;
          border: 3px solid rgba(255,255,255,.9);
          border-radius: 24px;
          box-shadow: 0 0 0 999px rgba(2,6,23,.36);
          pointer-events: none;
        }
        .scan-status {
          margin-top: 14px;
          color: rgba(255,255,255,.86);
          font-weight: 700;
          font-size: 14px;
          position: relative;
        }
        .scan-panel {
          background: #fff;
          border: 1px solid #e2e8f0;
          display: flex;
          flex-direction: column;
          gap: 14px;
        }
        .event-buttons {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 10px;
        }
        .event-button {
          border: 1px solid #dbe3ef;
          background: #f8fafc;
          color: #0f172a;
          border-radius: 18px;
          padding: 14px 12px;
          cursor: pointer;
          font-weight: 800;
          transition: transform .18s ease, border-color .18s ease, background .18s ease;
        }
        .event-button:hover {
          transform: translateY(-2px);
          border-color: #93c5fd;
          background: #eff6ff;
        }
        .event-button.active {
          color: #fff;
          border-color: transparent;
          background: linear-gradient(135deg, #0f172a, #1d4ed8);
          box-shadow: 0 14px 28px rgba(37,99,235,.22);
        }
        .label {
          display: block;
          font-weight: 800;
          color: #0f172a;
          margin-bottom: 7px;
        }
        .input, .select {
          width: 100%;
          box-sizing: border-box;
          border: 1px solid #dbe3ef;
          border-radius: 16px;
          padding: 13px 14px;
          font-size: 15px;
          outline: none;
          background: #fff;
        }
        .input:focus, .select:focus {
          border-color: #2563eb;
          box-shadow: 0 0 0 4px rgba(37,99,235,.12);
        }
        .submit {
          width: 100%;
          border: 0;
          border-radius: 18px;
          padding: 15px 18px;
          color: #fff;
          background: linear-gradient(135deg, #0f172a, #1d4ed8);
          font-weight: 900;
          font-size: 16px;
          cursor: pointer;
          box-shadow: 0 16px 30px rgba(15,23,42,.22);
        }
        .submit:disabled {
          opacity: .65;
          cursor: not-allowed;
        }
        .alert {
          border-radius: 22px;
          padding: 18px;
          display: grid;
          grid-template-columns: auto 1fr;
          gap: 14px;
          align-items: start;
          animation: pop .24s ease-out;
        }
        .alert.success {
          background: #dcfce7;
          border: 1px solid #86efac;
        }
        .alert.warning {
          background: #fff7ed;
          border: 1px solid #fdba74;
        }
        .emoji {
          width: 48px;
          height: 48px;
          border-radius: 18px;
          display: grid;
          place-items: center;
          font-size: 28px;
          background: rgba(255,255,255,.75);
        }
        .alert h3 {
          margin: 0;
          color: #0f172a;
          font-size: 20px;
        }
        .alert p {
          margin: 5px 0 0;
          color: #475569;
          line-height: 1.45;
        }
        .tiny {
          color: #64748b;
          font-size: 13px;
          line-height: 1.45;
        }
        @keyframes pop {
          from { transform: scale(.96); opacity: 0; }
          to { transform: scale(1); opacity: 1; }
        }
        @media (max-width: 860px) {
          .scan-page {
            padding: 12px;
            align-items: flex-start;
          }
          .scan-card {
            grid-template-columns: 1fr;
            padding: 14px;
            border-radius: 24px;
          }
          .scan-hero {
            min-height: auto;
          }
          .camera-box, .camera-box video {
            min-height: 260px;
          }
          .event-buttons {
            grid-template-columns: 1fr;
          }
        }
        @media (max-width: 460px) {
          .scan-page {
            padding: 8px;
          }
          .scan-hero, .scan-panel {
            padding: 16px;
            border-radius: 20px;
          }
          .camera-box, .camera-box video {
            min-height: 230px;
          }
          .camera-frame {
            inset: 24px;
            border-radius: 18px;
          }
          .submit, .event-button, .input, .select {
            font-size: 14px;
          }
        }
      `}</style>

      <div className="scan-card">
        <section className="scan-hero">
          <div>
            <h1>Pointage rapide</h1>
            <p>Scanne le QR du kiosque, choisis ton action, et c’est enregistré.</p>
          </div>

          <div>
            <div className="camera-box">
              <video id="qr-video" muted playsInline />
              <div className="camera-frame" />
            </div>
            <div className="scan-status">{scanning ? "Caméra active — vise le QR" : cameraError || "Tu peux aussi coller le token du QR"}</div>
          </div>
        </section>

        <section className="scan-panel">
          <div>
            <span className="label">Action</span>
            <div className="event-buttons">
              {Object.entries(eventMeta).map(([key, item]) => (
                <button
                  key={key}
                  type="button"
                  className={`event-button ${eventType === key ? "active" : ""}`}
                  onClick={() => setEventType(key)}
                >
                  {item.title}
                </button>
              ))}
            </div>
          </div>

          <label>
            <span className="label">Token QR</span>
            <input
              className="input"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              placeholder="Scanné automatiquement ou colle le token ici"
            />
          </label>

          <button className="submit" onClick={submit} disabled={busy}>
            {busy ? "Enregistrement..." : "Valider le pointage"}
          </button>

          {message && (
            <div className={`alert ${success ? "success" : "warning"}`}>
              <div className="emoji" style={{ background: success ? meta.color : "#f59e0b" }} />
              <div>
                <h3>{success ? meta.title : "Action requise"}</h3>
                <p>{success ? meta.text : message}</p>
                {details?.checks && (
                  <p>
                    QR: {details.checks.qrValid ? "ok" : "non"} · Agenda: {details.checks.agendaFits ? "ok" : "non"}
                    {details.checks.noSchedule ? " · Pas d'horaire aujourd'hui" : ""}
                  </p>
                )}
                {warning && result?.failures?.length ? <p>{result.failures.join("; ")}</p> : null}
              </div>
            </div>
          )}

          <div className="tiny">
            Pause autorisée après 2h de travail. La durée de pause est fixée par l'admin.
          </div>
        </section>
      </div>
    </div>
  );
}
