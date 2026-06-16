import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api";

type HistoryEvent = {
  id: number;
  eventType: string;
  eventAt: string;
  approvalStatus?: string;
};

type HistoryRow = {
  userId: number;
  user: { email: string; name?: string | null };
  date: string;
  checkIn?: HistoryEvent | null;
  checkOut?: HistoryEvent | null;
  breakStarts: HistoryEvent[];
  breakEnds: HistoryEvent[];
  events: HistoryEvent[];
  breakMinutes: number;
  totalMinutes: number;
  workMinutes: number;
  expectedMinutes: number;
  productivity: number;
  duration: string;
};

const eventLabel: Record<string, string> = {
  CHECK_IN: "Arrivée",
  BREAK_START: "Début pause",
  BREAK_END: "Fin pause",
  CHECK_OUT: "Départ",
};

export default function AttendanceHistoryPage() {
  const today = new Date();
  const localDate = new Date(today.getTime() - today.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
  const [date, setDate] = useState(localDate);
  const [rows, setRows] = useState<HistoryRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await api.get(`/attendance/admin/history?date=${date}`);
      setRows(res.data.rows || []);
    } catch (e: any) {
      setError(e?.response?.data?.message || "Impossible de charger l'historique");
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    load();
  }, [date]);

  const totals = useMemo(() => {
    const work = rows.reduce((sum, row) => sum + row.workMinutes, 0);
    const expected = rows.reduce((sum, row) => sum + row.expectedMinutes, 0);
    const overtime = Math.max(0, work - expected);
    const productivity = rows.length > 0 ? Math.round(rows.reduce((sum, row) => sum + row.productivity, 0) / rows.length) : 100;
    return {
      workers: rows.length,
      work,
      expected,
      overtime,
      productivity,
    };
  }, [rows]);

  const formatDuration = (minutes: number) => {
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return `${h}h ${String(m).padStart(2, "0")}`;
  };

  const formatTime = (value?: string) => (value ? new Date(value).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "—");

  return (
    <div style={{ minHeight: "100vh", background: "linear-gradient(135deg,#f8fafc,#e0f2fe)", padding: "20px" }}>
      <style>{`
        @media (max-width: 900px) {
          .history-grid { grid-template-columns: 1fr !important; }
          .history-table { min-width: 760px; }
        }
        @media (max-width: 640px) {
          .history-page { padding: 10px !important; }
          .history-card { padding: 14px !important; border-radius: 18px !important; }
        }
      `}</style>

      <div className="history-page" style={{ maxWidth: 1180, margin: "0 auto", display: "grid", gap: 18 }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
          <div>
            <h1 style={{ margin: 0, color: "#0f172a", fontSize: "clamp(28px,5vw,42px)" }}>Historique de pointage</h1>
            <p style={{ margin: "6px 0 0", color: "#64748b" }}>Arrivées, pauses, départs, heures travaillées et productivité.</p>
          </div>
          <Link to="/attendance" style={{ textDecoration: "none", ...buttonStyle }}>Retour admin</Link>
        </div>

        <div className="history-grid" style={{ display: "grid", gridTemplateColumns: "repeat(5, minmax(0,1fr))", gap: 12 }}>
          <StatCard label="Workers" value={totals.workers} />
          <StatCard label="Heures travaillées" value={formatDuration(Math.round(totals.work / 60 * 100) / 100)} />
          <StatCard label="Heures prévues" value={formatDuration(Math.round(totals.expected / 60 * 100) / 100)} />
          <StatCard label="Heures supplémentaires" value={formatDuration(Math.round(totals.overtime / 60 * 100) / 100)} />
          <StatCard label="Productivité moyenne" value={`${totals.productivity}%`} />
        </div>

        <div className="history-card" style={{ background: "#fff", borderRadius: 24, padding: 18, boxShadow: "0 20px 50px rgba(15,23,42,.08)" }}>
          <div style={{ display: "flex", gap: 12, alignItems: "end", flexWrap: "wrap" }}>
            <label style={{ display: "grid", gap: 6, fontWeight: 800, color: "#0f172a" }}>
              Date
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)} style={inputStyle} />
            </label>
            <button onClick={load} disabled={busy} style={{ ...buttonStyle, opacity: busy ? 0.7 : 1 }}>{busy ? "Chargement..." : "Actualiser"}</button>
          </div>
        </div>

        {error && <div style={{ padding: 14, borderRadius: 16, background: "#fee2e2", color: "#991b1b" }}>{error}</div>}

        <div className="history-card" style={{ background: "#fff", borderRadius: 24, padding: 18, boxShadow: "0 20px 50px rgba(15,23,42,.08)", overflow: "auto" }}>
          <div className="history-table" style={{ minWidth: 860 }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  <Th>Worker</Th>
                  <Th>Arrivée</Th>
                  <Th>Pauses</Th>
                  <Th>Départ</Th>
                  <Th>Travail</Th>
                  <Th>Prévu</Th>
                  <Th>Productivité</Th>
                  <Th>Actions</Th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.userId}>
                    <Td>
                      <strong style={{ color: "#0f172a" }}>{row.user.email}</strong>
                      <div style={{ color: "#64748b", fontSize: 13 }}>{row.events.length} actions</div>
                    </Td>
                    <Td>{formatTime(row.checkIn?.eventAt)}</Td>
                    <Td>
                      {row.breakStarts.map((start, index) => (
                        <div key={start.id} style={{ color: "#64748b", fontSize: 13 }}>
                          {formatTime(start.eventAt)} → {formatTime(row.breakEnds[index]?.eventAt)}
                        </div>
                      ))}
                      {row.breakStarts.length === 0 && <span style={{ color: "#94a3b8" }}>—</span>}
                    </Td>
                    <Td>{formatTime(row.checkOut?.eventAt)}</Td>
                    <Td><strong style={{ color: "#0f172a" }}>{row.duration}</strong></Td>
                    <Td>{formatDuration(Math.round(row.expectedMinutes / 60 * 100) / 100)}</Td>
                    <Td>
                      <span style={{ padding: "6px 10px", borderRadius: 999, background: row.productivity >= 90 ? "#dcfce7" : row.productivity >= 70 ? "#fef3c7" : "#fee2e2", color: row.productivity >= 90 ? "#166534" : row.productivity >= 70 ? "#92400e" : "#991b1b", fontWeight: 800 }}>
                        {row.productivity}%
                      </span>
                    </Td>
                    <Td>
                      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                        {row.events.map((event) => (
                          <span key={event.id} style={{ fontSize: 12, padding: "4px 7px", borderRadius: 999, background: "#f1f5f9", color: "#334155" }}>
                            {eventLabel[event.eventType] || event.eventType} {formatTime(event.eventAt)}
                          </span>
                        ))}
                      </div>
                    </Td>
                  </tr>
                ))}
                {rows.length === 0 && (
                  <tr>
                    <Td colSpan={8} style={{ textAlign: "center", color: "#64748b", padding: 24 }}>Aucun pointage pour cette date.</Td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div style={{ background: "#fff", borderRadius: 22, padding: 18, boxShadow: "0 16px 40px rgba(15,23,42,.08)" }}>
      <div style={{ color: "#64748b", fontSize: 13, fontWeight: 700 }}>{label}</div>
      <div style={{ marginTop: 8, color: "#0f172a", fontSize: "clamp(24px,4vw,36px)", fontWeight: 900 }}>{value}</div>
    </div>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return <th style={{ textAlign: "left", padding: 12, borderBottom: "1px solid #e2e8f0", color: "#64748b", fontSize: 13 }}>{children}</th>;
}

function Td({ children, colSpan, style }: { children: React.ReactNode; colSpan?: number; style?: React.CSSProperties }) {
  return <td colSpan={colSpan} style={{ padding: 12, borderBottom: "1px solid #f1f5f9", verticalAlign: "top", ...style }}>{children}</td>;
}

const inputStyle = {
  padding: "10px 12px",
  borderRadius: 12,
  border: "1px solid #dbe3ef",
  outline: "none",
  background: "#fff",
};

const buttonStyle = {
  padding: "11px 14px",
  borderRadius: 14,
  border: 0,
  background: "linear-gradient(135deg,#0f172a,#1d4ed8)",
  color: "#fff",
  fontWeight: 800,
  cursor: "pointer",
  boxShadow: "0 12px 24px rgba(15,23,42,.16)",
};
