import { useEffect, useMemo, useState } from "react";
import { api } from "../api";

const daysMap = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const BREAK_MIN_AFTER_HOURS = 2;
const card = { background: "#1a1a1a", borderRadius: 24, boxShadow: "0 20px 50px rgba(0,0,0,0.3)", padding: 22, border: "1px solid #333" };
const input = { width: "100%", padding: "12px 14px", border: "1px solid #333", borderRadius: 14, outline: "none", background: "#0a0a0a", color: "#ffffff" };
const btn = { padding: "12px 16px", border: 0, borderRadius: 14, background: "linear-gradient(135deg,#d4ff00,#a8e600)", color: "#0a0a0a", fontWeight: 700, cursor: "pointer" };
const help = { marginTop: 6, marginBottom: 16, color: "#94a3b8", fontSize: 13, lineHeight: 1.45 };

type UserRow = { id: number; email: string; role: "SUPERADMIN" | "ADMIN" | "CLIENT"; name?: string | null };
type TeamRow = { id: number; name: string; assignments?: Array<{ id: number; dayOfWeek: number }> };
type ScheduleRow = { id: number; userId: number; teamId?: number | null; dayOfWeek: number[] | number; startTime: string; endTime: string; breakMinAfterHours: number; breakMinutes: number; manualOverrideAllowed: boolean; isActive?: boolean; restaurant?: string | null; user?: { email?: string | null }; team?: { id: number; name: string } | null };
type DayOffRow = { id: number; userId: number; date: string; reason?: string | null };
type KioskState = { active: boolean; timeLeftSeconds?: number; session?: { id: number; token: string } | null };
type EventRow = { id: number; eventType: string; eventAt: string; isSuspicious?: boolean; approvalStatus?: string; rejectionReason?: string | null; user?: { email?: string | null } };
type OverrideRow = { id: number; status: string; reason?: string | null; createdAt: string; user?: { email?: string | null }; event?: { user?: { email?: string | null } } };
type SummaryRow = { label: string; value: string | number; tone?: string };

async function withBusy(setBusyState: (v: boolean) => void, fn: () => Promise<void>) {
  setBusyState(true);
  try { await fn(); } finally { setBusyState(false); }
}

export default function AttendanceAdminPage() {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [teams, setTeams] = useState<TeamRow[]>([]);
  const [schedules, setSchedules] = useState<ScheduleRow[]>([]);
  const [dayOffs, setDayOffs] = useState<DayOffRow[]>([]);
  const [events, setEvents] = useState<EventRow[]>([]);
  const [restaurantHours, setRestaurantHours] = useState<any[]>([]);
  const [kioskState, setKioskState] = useState<KioskState | null>(null);
  const [overrides, setOverrides] = useState<OverrideRow[]>([]);
  const [selectedWorkerSchedules, setSelectedWorkerSchedules] = useState<ScheduleRow[]>([]);
  const [selectedWorkerLabel, setSelectedWorkerLabel] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [teamName, setTeamName] = useState("");
  const [teamDays, setTeamDays] = useState<number[]>([]);
  const [editingScheduleId, setEditingScheduleId] = useState<number | null>(null);
  const [scheduleForm, setScheduleForm] = useState({ userId: "", teamId: "", dayOfWeek: [] as number[], startTime: "09:00", endTime: "18:00", breakMinutes: 60, manualOverrideAllowed: false, restaurant: "" });
  const [dayOffForm, setDayOffForm] = useState({ userId: "", date: "", reason: "" });
  const [manualEventForm, setManualEventForm] = useState({ userId: "", eventType: "CHECK_IN", eventAt: "", note: "", scheduleId: "", sessionId: "", isOverride: false });
  const [restaurantForm, setRestaurantForm] = useState({ name: "", openDays: [] as number[], openTime: "09:00", closeTime: "22:00", isActive: true });

  const load = async () => {
    const [u, t, s, d, e, rh, ks, ov] = await Promise.all([
      api.get("/attendance/admin/users"), api.get("/attendance/admin/teams"), api.get("/attendance/admin/schedules"),
      api.get("/attendance/admin/day-off"), api.get("/attendance/admin/events"), api.get("/attendance/admin/restaurant-hours"),
      api.get("/attendance/kiosk"), api.get("/attendance/admin/overrides"),
    ]);
    setUsers(u.data || []); setTeams(t.data || []); setSchedules(s.data || []); setDayOffs(d.data || []);
    setEvents(e.data || []); setRestaurantHours(rh.data || []); setKioskState(ks.data || null); setOverrides(ov.data || []);
  };
  useEffect(() => { load().catch(() => {}); }, []);

  const createTeam = async () => {
    await withBusy(setBusy, async () => {
      await api.post("/attendance/admin/teams", { name: teamName, days: teamDays });
      setTeamName(""); setTeamDays([]); await load(); setNotice("Équipe créée");
    });
  };
  const createRestaurantHours = async () => {
    await withBusy(setBusy, async () => {
      await api.post("/attendance/admin/restaurant-hours", restaurantForm);
      setNotice("Horaires restaurant enregistrés"); await load();
    });
  };
  const approveOverride = async (id: number, status: string) => {
    await withBusy(setBusy, async () => {
      await api.patch(`/attendance/admin/overrides/${id}`, { status, reason: "Traité depuis le dashboard" });
      setNotice(`Override ${status}`); await load();
    });
  };
  const startEditSchedule = (schedule: ScheduleRow) => {
    const days = Array.isArray(schedule.dayOfWeek) ? schedule.dayOfWeek : [schedule.dayOfWeek];
    setEditingScheduleId(schedule.id);
    setScheduleForm({ userId: String(schedule.userId), teamId: schedule.teamId ? String(schedule.teamId) : "", dayOfWeek: days, startTime: schedule.startTime, endTime: schedule.endTime, breakMinutes: schedule.breakMinutes, manualOverrideAllowed: schedule.manualOverrideAllowed, restaurant: schedule.restaurant || "" });
  };
  const resetScheduleForm = () => { setEditingScheduleId(null); setScheduleForm({ userId: "", teamId: "", dayOfWeek: [], startTime: "09:00", endTime: "18:00", breakMinutes: 60, manualOverrideAllowed: false, restaurant: "" }); };
  const saveSchedule = async () => {
    await withBusy(setBusy, async () => {
      if (editingScheduleId) { await api.patch(`/attendance/admin/schedules/${editingScheduleId}`, { ...scheduleForm, dayOfWeek: scheduleForm.dayOfWeek[0] || 1 }); setNotice("Horaire worker mis à jour"); }
      else { await api.post("/attendance/admin/schedules", scheduleForm); setNotice("Horaire worker créé"); }
      resetScheduleForm(); await load();
    });
  };
  const createDayOff = async () => {
    await withBusy(setBusy, async () => {
      await api.post("/attendance/admin/day-off", dayOffForm);
      setDayOffForm({ userId: "", date: "", reason: "" }); setNotice("Jour off ajouté"); await load();
    });
  };
  const createManualEvent = async () => {
    await withBusy(setBusy, async () => {
      await api.post("/attendance/admin/events/manual", { ...manualEventForm, scheduleId: manualEventForm.scheduleId ? Number(manualEventForm.scheduleId) : null, sessionId: manualEventForm.sessionId ? Number(manualEventForm.sessionId) : null });
      setManualEventForm({ userId: "", eventType: "CHECK_IN", eventAt: "", note: "", scheduleId: "", sessionId: "", isOverride: false });
      setNotice("Pointage manuel enregistré"); await load();
    });
  };

  const usersMap = useMemo(() => Object.fromEntries(users.map((u) => [u.id, u])) as Record<number, UserRow>, [users]);
  const schedulesByUser = useMemo(() => schedules.reduce<Record<number, ScheduleRow[]>>((acc, s) => { if (!acc[s.userId]) acc[s.userId] = []; acc[s.userId].push(s); return acc; }, {}), [schedules]);
  const todayKey = new Date(new Date().getTime() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);
  const summary = useMemo<SummaryRow[]>(() => {
    const todayEvents = events.filter((e) => new Date(e.eventAt).toISOString().slice(0, 10) === todayKey);
    return [
      { label: "Workers", value: users.filter((u) => u.role === "CLIENT").length },
      { label: "Équipes", value: teams.length },
      { label: "Horaires actifs", value: schedules.filter((s) => s.isActive !== false).length },
      { label: "Jours off aujourd'hui", value: dayOffs.filter((d) => d.date.startsWith(todayKey)).length },
      { label: "Pointages aujourd'hui", value: todayEvents.length },
      { label: "Pointages rejetés", value: todayEvents.filter((e) => e.approvalStatus === "REJECTED").length, tone: "#dc2626" },
      { label: "QR expire dans", value: `${Math.floor((kioskState?.timeLeftSeconds || 0) / 60)} min` },
      { label: "Overrides", value: overrides.length },
    ];
  }, [users, teams, schedules, dayOffs, events, kioskState, overrides, todayKey]);

  return (
    <div style={{ padding: 24, display: "grid", gap: 20, background: "#0a0a0a", minHeight: "100vh" }}>
      <div style={card}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 16, flexWrap: "wrap", alignItems: "center" }}>
          <div>
            <div style={{ background: "#d4ff00", color: "#0a0a0a", padding: 12, borderRadius: 14, fontWeight: 700 }}>Pointage admin</div>
            <h2 style={{ margin: "10px 0 0", color: "#ffffff" }}>Agenda, équipes, jours off, fenêtres QR</h2>
            <p style={help}>Le QR est généré automatiquement toutes les 30 minutes pendant la plage de travail définie pour le restaurant.</p>
          </div>
          {notice && <div style={{ padding: 12, borderRadius: 14, background: "#333", color: "#ffffff", maxWidth: 360 }}>{notice}</div>}
        </div>
      </div>
      <section style={card}>
        <h3 style={{ color: "#d4ff00" }}>QR kiosque actif</h3>
        <p style={help}>Le QR se renouvelle automatiquement toutes les 30 minutes.</p>
        {kioskState?.session ? (
          <div style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: 18, alignItems: "center" }}>
            <img src={`https://api.qrserver.com/v1/create-qr-code/?size=260x260&data=${encodeURIComponent(kioskState.session.token)}`} alt="QR" style={{ width: 260, height: 260, background: "#ffffff", borderRadius: 18, padding: 10 }} />
            <div style={{ display: "grid", gap: 8 }}>
              <div style={{ fontWeight: 800, color: "#d4ff00" }}>Session #{kioskState.session.id}</div>
              <div style={{ color: "#94a3b8" }}>Expire dans {Math.floor((kioskState.timeLeftSeconds || 0) / 60)} min</div>
              <div style={{ wordBreak: "break-all", background: "#0a0a0a", padding: 10, borderRadius: 10, color: "#ffffff" }}>{kioskState.session.token}</div>
              <a href="/attendance/kiosk" target="_blank" rel="noreferrer" style={{ ...btn, textAlign: "center", textDecoration: "none" }}>Ouvrir kiosque</a>
            </div>
          </div>
        ) : <div style={{ padding: 14, borderRadius: 12, background: "#0a0a0a", color: "#94a3b8" }}>Aucun QR actif.</div>}
      </section>
      <section style={card}>
        <h3 style={{ marginTop: 0, color: "#d4ff00" }}>Créer une équipe</h3>
        <p style={help}>Crée un groupe de travail.</p>
        <div style={{ display: "grid", gap: 12 }}>
          <div><label style={{ display: "block", fontWeight: 700, marginBottom: 6, color: "#ffffff" }}>Nom</label><input style={input} value={teamName} onChange={(e) => setTeamName(e.target.value)} placeholder="Nom équipe" /></div>
          <div><label style={{ display: "block", fontWeight: 700, marginBottom: 6, color: "#ffffff" }}>Jours</label>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0,1fr))", gap: 8 }}>
              {daysMap.map((d, i) => { const day = i === 0 ? 7 : i; const checked = teamDays.includes(day); return (<button key={day} type="button" onClick={() => setTeamDays((prev) => checked ? prev.filter((x) => x !== day) : [...prev, day])} style={{ padding: "10px 12px", borderRadius: 12, border: checked ? "1px solid #d4ff00" : "1px solid #333", background: checked ? "#d4ff00" : "#0a0a0a", color: checked ? "#0a0a0a" : "#ffffff", fontWeight: 700, cursor: "pointer" }}>{d}</button>); })}
            </div>
          </div>
          <button style={btn} disabled={busy} onClick={createTeam}>Créer équipe</button>
        </div>
      </section>
      <section style={card}>
        <h3 style={{ color: "#d4ff00" }}>Horaires du restaurant</h3>
        <p style={help}>Heures d'ouverture.</p>
        <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(2, minmax(0,1fr))" }}>
          <div style={{ gridColumn: "1 / -1" }}><label style={{ display: "block", fontWeight: 700, marginBottom: 6, color: "#ffffff" }}>Nom</label><input style={input} value={restaurantForm.name} onChange={(e) => setRestaurantForm({ ...restaurantForm, name: e.target.value })} placeholder="Restaurant" /></div>
          <div><label style={{ display: "block", fontWeight: 700, marginBottom: 6, color: "#ffffff" }}>Ouverture</label><input style={input} type="time" value={restaurantForm.openTime} onChange={(e) => setRestaurantForm({ ...restaurantForm, openTime: e.target.value })} /></div>
          <div><label style={{ display: "block", fontWeight: 700, marginBottom: 6, color: "#ffffff" }}>Fermeture</label><input style={input} type="time" value={restaurantForm.closeTime} onChange={(e) => setRestaurantForm({ ...restaurantForm, closeTime: e.target.value })} /></div>
          <div style={{ gridColumn: "1 / -1" }}><label style={{ display: "block", fontWeight: 700, marginBottom: 6, color: "#ffffff" }}>Jours ouverts</label>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0,1fr))", gap: 8 }}>
              {daysMap.map((d, i) => { const day = i === 0 ? 7 : i; const checked = restaurantForm.openDays.includes(day); return (<button key={day} type="button" onClick={() => setRestaurantForm((prev) => ({ ...prev, openDays: checked ? prev.openDays.filter((x) => x !== day) : [...prev.openDays, day] }))} style={{ padding: "10px 12px", borderRadius: 12, border: checked ? "1px solid #d4ff00" : "1px solid #333", background: checked ? "#d4ff00" : "#0a0a0a", color: checked ? "#0a0a0a" : "#ffffff", fontWeight: 700, cursor: "pointer" }}>{d}</button>); })}
            </div>
          </div>
          <label style={{ display: "flex", gap: 8, alignItems: "center", gridColumn: "1 / -1" }}><input type="checkbox" checked={restaurantForm.isActive} onChange={(e) => setRestaurantForm({ ...restaurantForm, isActive: e.target.checked })} /><span style={{ color: "#ffffff" }}>Actif</span></label>
          <button style={{ ...btn, gridColumn: "1 / -1" }} disabled={busy} onClick={createRestaurantHours}>Enregistrer</button>
        </div>
        <div style={{ marginTop: 18, display: "grid", gap: 10 }}>
          {restaurantHours.map((r) => (
            <div key={r.id} style={{ border: "1px solid #333", borderRadius: 14, padding: 12, display: "grid", gap: 8 }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                <strong style={{ color: "#d4ff00" }}>{r.name}</strong>
              </div>
              <div style={{ color: "#ffffff" }}>{r.openTime} → {r.closeTime}</div>
              <div style={{ color: "#ffffff" }}>Jours: {(r.openDays || []).map((d: number) => daysMap[d % 7]).join(", ")}</div>
            </div>
          ))}
        </div>
      </section>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 10 }}>
        {summary.map((item) => (<div key={item.label} style={{ background: "#0a0a0a", border: "1px solid #333", borderRadius: 16, padding: 12 }}><div style={{ color: "#94a3b8", fontSize: 12, fontWeight: 700 }}>{item.label}</div><div style={{ marginTop: 4, color: item.tone || "#d4ff00", fontSize: 24, fontWeight: 900 }}>{item.value}</div></div>))}
      </div>
      <section style={card}>
        <h3 style={{ color: "#d4ff00" }}>Pointages suspects / rejetés</h3>
        <div style={{ display: "grid", gap: 8 }}>
          {events.filter((e) => e.isSuspicious || e.approvalStatus === "SUSPICIOUS" || e.approvalStatus === "REJECTED").map((e) => (
            <div key={e.id} style={{ border: e.approvalStatus === "REJECTED" ? "1px solid #991b1b" : "1px solid #f59e0b", borderRadius: 14, padding: 12, background: "#1a1a1a" }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                <strong style={{ color: "#ffffff" }}>{e.user?.email || "Worker"} · {e.eventType} · {e.approvalStatus}</strong>
                <span style={{ color: "#94a3b8" }}>{new Date(e.eventAt).toLocaleString()}</span>
              </div>
              <div style={{ color: "#ffffff" }}>Raison: {e.rejectionReason || "Pointage suspect"}</div>
            </div>
          ))}
          {events.filter((e) => e.isSuspicious || e.approvalStatus === "SUSPICIOUS" || e.approvalStatus === "REJECTED").length === 0 && (
            <div style={{ padding: 14, borderRadius: 12, background: "#0a0a0a", color: "#94a3b8" }}>Aucun pointage suspect.</div>
          )}
        </div>
      </section>
      <section style={card}>
        <h3 style={{ color: "#d4ff00" }}>Overrides admin</h3>
        <div style={{ display: "grid", gap: 8 }}>
          {overrides.map((o) => (
            <div key={o.id} style={{ border: "1px solid #333", borderRadius: 14, padding: 12, background: "#1a1a1a", display: "grid", gap: 8 }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                <strong style={{ color: "#ffffff" }}>{o.user?.email || o.event?.user?.email || "Worker"} · {o.status}</strong>
                <span style={{ color: "#94a3b8" }}>{new Date(o.createdAt).toLocaleString()}</span>
              </div>
              <div style={{ color: "#ffffff" }}>{o.reason}</div>
              <div style={{ display: "flex", gap: 8 }}>
                <button style={{ ...btn, padding: "8px 12px", background: "#047857" }} onClick={() => approveOverride(o.id, "OVERRIDDEN")}>Accepter</button>
                <button style={{ ...btn, padding: "8px 12px", background: "#991b1b" }} onClick={() => approveOverride(o.id, "REJECTED")}>Rejeter</button>
              </div>
            </div>
          ))}
          {overrides.length === 0 && <div style={{ padding: 14, borderRadius: 12, background: "#0a0a0a", color: "#94a3b8" }}>Aucun override.</div>}
        </div>
      </section>
      <section style={card}>
        <h3 style={{ color: "#d4ff00" }}>Horaires workers</h3>
        <p style={help}>Clique sur un worker pour voir ses horaires.</p>
        <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))" }}>
          {Object.keys(schedulesByUser).length === 0 ? (
            <div style={{ padding: 14, borderRadius: 12, background: "#0a0a0a", color: "#94a3b8" }}>Aucun horaire.</div>
          ) : (
            Object.entries(schedulesByUser).map(([userId, workerSchedules]) => {
              const worker = usersMap[Number(userId)] || workerSchedules[0]?.user;
              const label = worker?.email || worker?.name || `Worker ${userId}`;
              return (
                <button key={userId} type="button" onClick={() => { setSelectedWorkerLabel(label); setSelectedWorkerSchedules(workerSchedules); }}
                  onDoubleClick={(e) => { e.stopPropagation(); startEditSchedule(workerSchedules[0]); }} title="Clic: détails"
                  style={{ textAlign: "left", background: "#0a0a0a", border: "1px solid #333", borderRadius: 20, padding: 16, cursor: "pointer" }}>
                  <strong style={{ color: "#ffffff", display: "block", marginBottom: 6 }}>{label}</strong>
                  <span style={{ color: "#94a3b8", fontSize: 13 }}>{workerSchedules.length} horaire(s)</span>
                </button>
              );
            })
          )}
        </div>
      </section>
      {selectedWorkerSchedules.length > 0 && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", display: "grid", placeItems: "center", padding: 16, zIndex: 50 }}>
          <div style={{ background: "#1a1a1a", borderRadius: 24, padding: 22, width: "min(100%, 720px)", maxHeight: "85vh", overflow: "auto" }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "start" }}>
              <div><h3 style={{ margin: 0, color: "#ffffff" }}>{selectedWorkerLabel}</h3><p style={{ margin: "6px 0 0", color: "#94a3b8" }}>Détails</p></div>
              <button style={{ ...btn, padding: "8px 12px", background: "#64748b" }} onClick={() => setSelectedWorkerSchedules([])}>Fermer</button>
            </div>
            <div style={{ display: "grid", gap: 10, marginTop: 16 }}>
              {selectedWorkerSchedules.map((s) => (
                <div key={s.id} style={{ background: "#0a0a0a", borderRadius: 16, padding: 12, border: "1px solid #333" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
                    <strong style={{ color: "#ffffff" }}>{Array.isArray(s.dayOfWeek) ? s.dayOfWeek.map((d) => daysMap[d % 7]).join(", ") : daysMap[(s.dayOfWeek as number) % 7]}</strong>
                    <span style={{ color: "#94a3b8" }}>{s.startTime} → {s.endTime}</span>
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0,1fr))", gap: 8, marginTop: 10 }}>
                    <div style={{ color: "#94a3b8", fontSize: 13 }}>Pause après: <strong style={{ color: "#d4ff00" }}>{BREAK_MIN_AFTER_HOURS}h</strong></div>
                    <div style={{ color: "#94a3b8", fontSize: 13 }}>Durée: <strong style={{ color: "#d4ff00" }}>{s.breakMinutes} min</strong></div>
                    <div style={{ color: "#94a3b8", fontSize: 13 }}>Équipe: <strong style={{ color: "#d4ff00" }}>{s.team?.name || "—"}</strong></div>
                    <div style={{ color: "#94a3b8", fontSize: 13 }}>Restaurant: <strong style={{ color: "#d4ff00" }}>{s.restaurant || "—"}</strong></div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
      <section style={card}>
        <h3 style={{ marginTop: 0, color: "#d4ff00" }}>{editingScheduleId ? "Modifier l'horaire" : "Créer un horaire"}</h3>
        <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(3, minmax(0,1fr))" }}>
          <div><label style={{ display: "block", fontWeight: 700, marginBottom: 6, color: "#ffffff" }}>Worker</label><select style={input} value={scheduleForm.userId} onChange={(e) => setScheduleForm({ ...scheduleForm, userId: e.target.value })}><option value="">Worker</option>{users.filter((u) => u.role === "CLIENT").map((u) => (<option key={u.id} value={u.id}>{u.email}</option>))}</select></div>
          <div><label style={{ display: "block", fontWeight: 700, marginBottom: 6, color: "#ffffff" }}>Équipe</label><select style={input} value={scheduleForm.teamId} onChange={(e) => setScheduleForm({ ...scheduleForm, teamId: e.target.value })}><option value="">Équipe</option>{teams.map((t) => (<option key={t.id} value={t.id}>{t.name}</option>))}</select></div>
          <div><label style={{ display: "block", fontWeight: 700, marginBottom: 6, color: "#ffffff" }}>Jours</label>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0,1fr))", gap: 8 }}>
              {daysMap.map((d, i) => { const day = i === 0 ? 7 : i; const checked = scheduleForm.dayOfWeek.includes(day); return (<button key={day} type="button" onClick={() => setScheduleForm((prev) => ({ ...prev, dayOfWeek: editingScheduleId ? [day] : checked ? prev.dayOfWeek.filter((x) => x !== day) : [...prev.dayOfWeek, day] }))} style={{ padding: "10px 12px", borderRadius: 12, border: checked ? "1px solid #d4ff00" : "1px solid #333", background: checked ? "#d4ff00" : "#0a0a0a", color: checked ? "#0a0a0a" : "#ffffff", fontWeight: 700, cursor: "pointer" }}>{d}</button>); })}
            </div>
          </div>
          <div><label style={{ display: "block", fontWeight: 700, marginBottom: 6, color: "#ffffff" }}>Début</label><input style={input} type="time" value={scheduleForm.startTime} onChange={(e) => setScheduleForm({ ...scheduleForm, startTime: e.target.value })} /></div>
          <div><label style={{ display: "block", fontWeight: 700, marginBottom: 6, color: "#ffffff" }}>Fin</label><input style={input} type="time" value={scheduleForm.endTime} onChange={(e) => setScheduleForm({ ...scheduleForm, endTime: e.target.value })} /></div>
          <div><label style={{ display: "block", fontWeight: 700, marginBottom: 6, color: "#ffffff" }}>Pause</label><input style={input} type="number" min="1" value={scheduleForm.breakMinutes} onChange={(e) => setScheduleForm({ ...scheduleForm, breakMinutes: Number(e.target.value) })} /></div>
          <div style={{ gridColumn: "1 / -1", background: "#0a0a0a", borderRadius: 14, padding: 10, border: "1px solid #333" }}>
            <div style={{ color: "#94a3b8", fontSize: 13 }}>Pause autorisée après {BREAK_MIN_AFTER_HOURS}h</div>
          </div>
          <div><label style={{ display: "block", fontWeight: 700, marginBottom: 6, color: "#ffffff" }}>Restaurant</label><input style={input} value={scheduleForm.restaurant} onChange={(e) => setScheduleForm({ ...scheduleForm, restaurant: e.target.value })} placeholder="Restaurant" /></div>
          <label style={{ display: "flex", gap: 8, alignItems: "center" }}><input type="checkbox" checked={scheduleForm.manualOverrideAllowed} onChange={(e) => setScheduleForm({ ...scheduleForm, manualOverrideAllowed: e.target.checked })} /><span style={{ color: "#ffffff" }}>Override autorisé</span></label>
          <div style={{ gridColumn: "1 / -1", display: "flex", gap: 12 }}>
            <button style={btn} disabled={busy} onClick={saveSchedule}>{editingScheduleId ? "Mettre à jour" : "Créer"}</button>
            {editingScheduleId && (<button type="button" style={{ ...btn, background: "#64748b" }} onClick={resetScheduleForm}>Annuler</button>)}
          </div>
        </div>
      </section>
      <section style={card}>
        <h3 style={{ marginTop: 0, color: "#d4ff00" }}>Congés / jours off</h3>
        <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(3, minmax(0,1fr))" }}>
          <div><label style={{ display: "block", fontWeight: 700, marginBottom: 6, color: "#ffffff" }}>Worker</label><select style={input} value={dayOffForm.userId} onChange={(e) => setDayOffForm({ ...dayOffForm, userId: e.target.value })}><option value="">Worker</option>{users.filter((u) => u.role === "CLIENT").map((u) => (<option key={u.id} value={u.id}>{u.email}</option>))}</select></div>
          <div><label style={{ display: "block", fontWeight: 700, marginBottom: 6, color: "#ffffff" }}>Date</label><input style={input} type="date" value={dayOffForm.date} onChange={(e) => setDayOffForm({ ...dayOffForm, date: e.target.value })} /></div>
          <div><label style={{ display: "block", fontWeight: 700, marginBottom: 6, color: "#ffffff" }}>Raison</label><input style={input} value={dayOffForm.reason} onChange={(e) => setDayOffForm({ ...dayOffForm, reason: e.target.value })} placeholder="Raison" /></div>
          <button style={{ ...btn, gridColumn: "1 / -1" }} disabled={busy} onClick={createDayOff}>Ajouter jour off</button>
        </div>
      </section>
      <section style={card}>
        <h3 style={{ marginTop: 0, color: "#d4ff00" }}>Override manuel / pointage forcé</h3>
        <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(4, minmax(0,1fr))" }}>
          <div><label style={{ display: "block", fontWeight: 700, marginBottom: 6, color: "#ffffff" }}>Worker</label><select style={input} value={manualEventForm.userId} onChange={(e) => setManualEventForm({ ...manualEventForm, userId: e.target.value })}><option value="">Worker</option>{users.filter((u) => u.role === "CLIENT").map((u) => (<option key={u.id} value={u.id}>{u.email}</option>))}</select></div>
          <div><label style={{ display: "block", fontWeight: 700, marginBottom: 6, color: "#ffffff" }}>Type</label><select style={input} value={manualEventForm.eventType} onChange={(e) => setManualEventForm({ ...manualEventForm, eventType: e.target.value })}>{["CHECK_IN", "BREAK_START", "BREAK_END", "CHECK_OUT"].map((x) => (<option key={x} value={x}>{x}</option>))}</select></div>
          <div><label style={{ display: "block", fontWeight: 700, marginBottom: 6, color: "#ffffff" }}>Date/Heure</label><input style={input} type="datetime-local" value={manualEventForm.eventAt} onChange={(e) => setManualEventForm({ ...manualEventForm, eventAt: e.target.value })} /></div>
          <div><label style={{ display: "block", fontWeight: 700, marginBottom: 6, color: "#ffffff" }}>Note</label><input style={input} value={manualEventForm.note} onChange={(e) => setManualEventForm({ ...manualEventForm, note: e.target.value })} placeholder="Note" /></div>
          <label style={{ display: "flex", gap: 8, alignItems: "center" }}><input type="checkbox" checked={manualEventForm.isOverride} onChange={(e) => setManualEventForm({ ...manualEventForm, isOverride: e.target.checked })} /><span style={{ color: "#d4ff00" }}>Override</span></label>
          <button style={{ ...btn, gridColumn: "1 / -1" }} disabled={busy} onClick={createManualEvent}>Enregistrer pointage</button>
        </div>
      </section>
    </div>
  );
}