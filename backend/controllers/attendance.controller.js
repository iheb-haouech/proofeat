// File: attendance.controller.js
const { PrismaClient } = require("@prisma/client");
const crypto = require("crypto");

const prisma = new PrismaClient();
const QR_TTL_MINUTES = 30;
const SUSPICIOUS_GRACE_MINUTES = 5;
const BREAK_MIN_AFTER_HOURS = 2;

function normalizeRole(role) {
  return String(role || "").toUpperCase();
}

function isAdminLike(user) {
  const role = normalizeRole(user?.role);
  return role === "ADMIN" || role === "SUPERADMIN";
}

function dayOfWeekNow(date = new Date()) {
  const d = date.getDay();
  return d === 0 ? 7 : d;
}

function ymd(date = new Date()) {
  return date.toISOString().slice(0, 10);
}

function parseMinutes(value) {
  const [h, m] = String(value || "").split(":").map(Number);
  if (Number.isNaN(h) || Number.isNaN(m)) return null;
  return h * 60 + m;
}

function minutesSinceMidnight(date = new Date()) {
  return date.getHours() * 60 + date.getMinutes();
}

function withinWindow(openTime, closeTime, now = new Date()) {
  const nowMin = minutesSinceMidnight(now);
  const openMin = parseMinutes(openTime);
  const closeMin = parseMinutes(closeTime);
  if (openMin == null || closeMin == null) return false;
  if (openMin <= closeMin) return nowMin >= openMin && nowMin <= closeMin;
  return nowMin >= openMin || nowMin <= closeMin;
}

function toQueryDateRange(date = new Date()) {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  const start = new Date(local.toISOString());
  const end = new Date(local.toISOString());
  start.setUTCHours(0, 0, 0, 0);
  end.setUTCHours(23, 59, 59, 999);
  return { start, end };
}

function localDateKey(date) {
  const value = date instanceof Date ? date : new Date(date);
  const local = new Date(value.getTime() - value.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
}

async function getActiveRestaurantHours(date = new Date()) {
  const dow = dayOfWeekNow(date);
  return prisma.restaurantHours.findFirst({
    where: {
      isActive: true,
      openDays: { has: dow },
    },
    orderBy: { updatedAt: "desc" },
  });
}

async function getWorkerSchedule(userId, date = new Date()) {
  const dow = dayOfWeekNow(date);
  return prisma.attendanceSchedule.findFirst({
    where: { userId, dayOfWeek: dow, isActive: true },
    include: { team: true, user: true },
    orderBy: { updatedAt: "desc" },
  });
}

async function getTodaysDayOff(userId, date = new Date()) {
  const { start, end } = toQueryDateRange(date);
  return prisma.attendanceDayOff.findFirst({
    where: { userId, date: { gte: start, lte: end } },
  });
}

async function getLastEvents(userId, take = 20) {
  return prisma.attendanceEvent.findMany({
    where: { userId },
    orderBy: { eventAt: "desc" },
    take,
  });
}

async function getLatestOpenSession(scheduleId) {
  const where = {
    isOpen: true,
    expiresAt: { gt: new Date() },
    ...(scheduleId
      ? { OR: [{ scheduleId }, { scheduleId: null }] }
      : { scheduleId: null }),
  };

  return prisma.attendanceQrSession.findFirst({
    where,
    orderBy: { createdAt: "desc" },
  });
}

async function createKioskSession(manualOpen = false) {
  const openedAt = new Date();
  const expiresAt = new Date(openedAt.getTime() + QR_TTL_MINUTES * 60 * 1000);
  const token = crypto.randomBytes(16).toString("hex");

  return prisma.attendanceQrSession.create({
    data: {
      token,
      scheduleId: null,
      openedAt,
      expiresAt,
      isOpen: true,
      manualOpen,
      metadata: { qrWindowMinutes: QR_TTL_MINUTES, auto: !manualOpen },
    },
  });
}

async function getOrCreateKioskSession() {
  const latest = await getLatestOpenSession(null);
  if (latest && latest.expiresAt > new Date()) return latest;
  return createKioskSession(false);
}

const VALID_APPROVAL_STATUSES = ["ACCEPTED", "OVERRIDDEN"];

function isValidEvent(event) {
  return VALID_APPROVAL_STATUSES.includes(event.approvalStatus) && !event.isSuspicious;
}

function getTodaysEvents(events, now = new Date()) {
  const key = localDateKey(now);
  return events
    .filter((e) => localDateKey(e.eventAt) === key)
    .sort((a, b) => new Date(a.eventAt).getTime() - new Date(b.eventAt).getTime());
}

function hasOpenShift(events, now = new Date()) {
  let open = false;
  getTodaysEvents(events, now).forEach((event) => {
    if (!isValidEvent(event)) return;
    if (event.eventType === "CHECK_IN") open = true;
    if (event.eventType === "CHECK_OUT") open = false;
  });
  return open;
}

function getOpenBreakStart(events, now = new Date()) {
  const today = getTodaysEvents(events, now).filter((e) => isValidEvent(e) && (e.eventType === "BREAK_START" || e.eventType === "BREAK_END"));
  let openStart = null;
  today.forEach((event) => {
    if (event.eventType === "BREAK_START") openStart = event;
    if (event.eventType === "BREAK_END") openStart = null;
  });
  return openStart;
}

function canCheckInNow(events, now = new Date()) {
  if (hasOpenShift(events, now)) return { ok: false, reason: "Check-in déjà effectué avant le check-out" };
  return { ok: true };
}

function requireOpenShift(events, now = new Date()) {
  if (!hasOpenShift(events, now)) return { ok: false, reason: "Check-in requis avant cette action" };
  return { ok: true };
}

function canBreakNow(events, schedule, now = new Date()) {
  const openShift = requireOpenShift(events, now);
  if (!openShift.ok) return openShift;

  const openBreak = getOpenBreakStart(events, now);
  if (openBreak) return { ok: false, reason: "Une pause est déjà en cours" };

  const checkIn = [...getTodaysEvents(events, now)].reverse().find((e) => isValidEvent(e) && e.eventType === "CHECK_IN");
  if (!checkIn) return { ok: false, reason: "Check-in requis avant la pause" };

  const workedMinutes = (now.getTime() - new Date(checkIn.eventAt).getTime()) / 60000;
  const minBreakAfterMinutes = BREAK_MIN_AFTER_HOURS * 60;
  if (workedMinutes < minBreakAfterMinutes) {
    return { ok: false, reason: "Pause autorisée après 2h de travail minimum" };
  }

  return { ok: true };
}

function canBreakEndNow(events, schedule, now = new Date()) {
  const openShift = requireOpenShift(events, now);
  if (!openShift.ok) return openShift;

  const openBreak = getOpenBreakStart(events, now);
  if (!openBreak) return { ok: false, reason: "Aucune pause en cours" };

  const breakMinutes = Number(schedule?.breakMinutes || 60);
  const breakDuration = (now.getTime() - new Date(openBreak.eventAt).getTime()) / 60000;
  if (breakDuration > breakMinutes + SUSPICIOUS_GRACE_MINUTES) {
    return { ok: false, reason: `Pause dépassée de ${Math.ceil(breakDuration - breakMinutes)} min` };
  }

  return { ok: true };
}

function canCheckOutNow(events, now = new Date()) {
  if (!hasOpenShift(events, now)) return { ok: false, reason: "Check-in requis avant le check-out" };
  return { ok: true };
}

async function getKioskState(req, res) {
  try {
    const now = new Date();
    const session = await getOrCreateKioskSession();
    const restaurantHours = await getActiveRestaurantHours(now);
    const restaurantOpen = restaurantHours ? withinWindow(restaurantHours.openTime, restaurantHours.closeTime, now) : false;

    return res.json({
      active: true,
      restaurantOpen,
      restaurantHours,
      session,
      timeLeftSeconds: Math.max(0, Math.floor((session.expiresAt.getTime() - now.getTime()) / 1000)),
    });
  } catch (err) {
    console.error("getKioskState:", err);
    return res.status(500).json({ message: "Impossible de charger l'état kiosk" });
  }
}


async function openQrSession(req, res) {
  try {
    if (!isAdminLike(req.user)) return res.status(403).json({ message: "Accès réservé" });

    const { scheduleId, manualOpen, metadata } = req.body || {};
    const id = Number(scheduleId);
    if (!id) return res.status(400).json({ message: "scheduleId requis" });

    const schedule = await prisma.attendanceSchedule.findUnique({ where: { id } });
    if (!schedule) return res.status(404).json({ message: "Horaire introuvable" });

    const token = crypto.randomBytes(16).toString("hex");
    const openedAt = new Date();
    const expiresAt = new Date(Date.now() + Number(schedule.qrWindowMinutes || QR_TTL_MINUTES) * 60 * 1000);

    const session = await prisma.attendanceQrSession.create({
      data: {
        token,
        scheduleId: schedule.id,
        openedById: req.user.id,
        openedAt,
        expiresAt,
        isOpen: true,
        manualOpen: Boolean(manualOpen),
        metadata: { ...(metadata || {}), qrWindowMinutes: Number(schedule.qrWindowMinutes || QR_TTL_MINUTES) },
      },
    });

    res.status(201).json(session);
  } catch (err) {
    console.error("openQrSession error:", err);
    res.status(500).json({ message: "Impossible d'ouvrir la fenêtre QR" });
  }
}

async function closeQrSession(req, res) {
  try {
    if (!isAdminLike(req.user)) return res.status(403).json({ message: "Accès réservé" });

    const id = Number(req.params.id);
    const session = await prisma.attendanceQrSession.update({
      where: { id },
      data: { isOpen: false },
    });

    res.json(session);
  } catch (err) {
    console.error("closeQrSession error:", err);
    res.status(500).json({ message: "Impossible de fermer la fenêtre QR" });
  }
}

async function validateScanRules(req, res) {
  try {
    const { eventType, qrToken, sessionId } = req.body || {};
    const allowed = ["CHECK_IN", "BREAK_START", "BREAK_END", "CHECK_OUT"];
    if (!allowed.includes(eventType)) return res.status(400).json({ message: "eventType invalide" });

    const user = req.user;
    const now = new Date();
    const dayOff = await getTodaysDayOff(user.id, now);
    if (dayOff && !isAdminLike(user)) return res.status(403).json({ message: "Jour off / congé" });

    const schedule = await getWorkerSchedule(user.id, now);
    const events = await getLastEvents(user.id, 100);
    const latestSession = sessionId
      ? await prisma.attendanceQrSession.findUnique({ where: { id: Number(sessionId) }, include: { schedule: true } })
      : await getLatestOpenSession(schedule?.id || null);

    const sessionWindowMinutes = Number(latestSession?.metadata?.qrWindowMinutes || latestSession?.schedule?.qrWindowMinutes || schedule?.qrWindowMinutes || QR_TTL_MINUTES);
    const sessionOk =
      latestSession &&
      latestSession.isOpen &&
      latestSession.expiresAt > now &&
      (now - new Date(latestSession.openedAt)) / 60000 <= sessionWindowMinutes;

    const tokenOk = latestSession && qrToken && String(qrToken).trim() === latestSession.token;
    const qrOk = sessionOk && tokenOk;

    const failures = [];
    if (!qrOk) failures.push("QR invalide ou expiré");

    if (eventType === "CHECK_IN") {
      const checkIn = canCheckInNow(events, now);
      if (!checkIn.ok) failures.push(checkIn.reason);
    } else if (eventType === "BREAK_START") {
      const breakOk = canBreakNow(events, schedule, now);
      if (!breakOk.ok) failures.push(breakOk.reason);
    } else if (eventType === "BREAK_END") {
      const breakEnd = canBreakEndNow(events, schedule, now);
      if (!breakEnd.ok) failures.push(breakEnd.reason);
    } else if (eventType === "CHECK_OUT") {
      const checkOut = canCheckOutNow(events, now);
      if (!checkOut.ok) failures.push(checkOut.reason);
    }

    return res.json({
      ok: failures.length === 0,
      accepted: failures.length === 0,
      decision: failures.length === 0 ? "ACCEPTED" : "REJECTED",
      failures,
      checks: {
        emailSession: Boolean(user?.id),
        qrValid: qrOk,
        holiday: dayOff ? "off" : "ok",
        breakMinimum: `${BREAK_MIN_AFTER_HOURS}h`,
        breakDuration: schedule ? `${Number(schedule.breakMinutes || 60)} min` : "60 min",
        agendaFits: true,
      },
      session: latestSession
        ? {
            id: latestSession.id,
            isOpen: latestSession.isOpen,
            expiresAt: latestSession.expiresAt,
            openedAt: latestSession.openedAt,
          }
        : null,
    });
  } catch (err) {
    console.error("validateScanRules error:", err);
    res.status(500).json({ message: "Impossible de valider le pointage" });
  }
}

async function recordQrEvent(req, user, eventType, qrToken, note, schedule = null) {
  const now = new Date();
  const session = await prisma.attendanceQrSession.findFirst({
    where: {
      token: String(qrToken || "").trim(),
      isOpen: true,
      expiresAt: { gt: now },
    },
  });

  if (!session) {
    return null;
  }

  return prisma.attendanceEvent.create({
    data: {
      userId: user.id,
      scheduleId: schedule?.id || null,
      sessionId: session.id,
      eventType,
      eventAt: now,
      qrToken: String(qrToken || "").trim(),
      note: note ? String(note) : null,
      isManual: false,
      isOverride: false,
      isSuspicious: false,
      approvalStatus: "ACCEPTED",
      rejectionReason: null,
      userAgent: req.headers["user-agent"] || null,
    },
    include: {
      schedule: true,
      session: true,
      user: { select: { id: true, email: true, name: true, role: true } },
    },
  });
}

async function scanKioskQr(req, res) {
  try {
    const { eventType, qrToken, note, sessionId } = req.body || {};
    const allowed = ["CHECK_IN", "BREAK_START", "BREAK_END", "CHECK_OUT"];
    if (!allowed.includes(eventType)) return res.status(400).json({ message: "eventType invalide" });

    const user = req.user;
    const now = new Date();
    const dayOff = await getTodaysDayOff(user.id, now);
    if (dayOff && !isAdminLike(user)) return res.status(403).json({ message: "Jour off / congé" });

    const schedule = await getWorkerSchedule(user.id, now);
    const events = await getLastEvents(user.id, 100);
    const latestSession = sessionId
      ? await prisma.attendanceQrSession.findUnique({ where: { id: Number(sessionId) }, include: { schedule: true } })
      : await getLatestOpenSession(schedule?.id || null);

    const sessionWindowMinutes = Number(latestSession?.metadata?.qrWindowMinutes || latestSession?.schedule?.qrWindowMinutes || schedule?.qrWindowMinutes || QR_TTL_MINUTES);
    const sessionOk =
      latestSession &&
      latestSession.isOpen &&
      latestSession.expiresAt > now &&
      (now - new Date(latestSession.openedAt)) / 60000 <= sessionWindowMinutes;

    const tokenOk = latestSession && qrToken && String(qrToken).trim() === latestSession.token;
    const qrOk = sessionOk && tokenOk;
    if (!qrOk) return res.status(403).json({ message: "QR invalide ou expiré" });

    const failures = [];
    if (eventType === "CHECK_IN") {
      const checkIn = canCheckInNow(events, now);
      if (!checkIn.ok) failures.push(checkIn.reason);
    } else if (eventType === "BREAK_START") {
      const breakOk = canBreakNow(events, schedule, now);
      if (!breakOk.ok) failures.push(breakOk.reason);
    } else if (eventType === "BREAK_END") {
      const breakEnd = canBreakEndNow(events, schedule, now);
      if (!breakEnd.ok) failures.push(breakEnd.reason);
    } else if (eventType === "CHECK_OUT") {
      const checkOut = canCheckOutNow(events, now);
      if (!checkOut.ok) failures.push(checkOut.reason);
    }

    if (failures.length > 0) {
      const rejected = await prisma.attendanceEvent.create({
        data: {
          userId: user.id,
          scheduleId: schedule?.id || null,
          sessionId: latestSession?.id || null,
          eventType,
          qrToken: String(qrToken || "").trim(),
          note: note ? String(note) : null,
          isManual: false,
          isOverride: false,
          isSuspicious: true,
          approvalStatus: "REJECTED",
          rejectionReason: failures.join("; "),
          userAgent: req.headers["user-agent"] || null,
        },
        include: {
          schedule: true,
          session: true,
          user: { select: { id: true, email: true, name: true, role: true } },
        },
      });
      return res.status(403).json({ ok: false, rejected, failures });
    }

    const event = await recordQrEvent(req, user, eventType, qrToken, note, schedule);
    if (!event) return res.status(403).json({ message: "QR invalide ou expiré" });

    res.status(201).json({
      ok: true,
      event,
      decision: "ACCEPTED",
      checks: {
        emailSession: Boolean(user?.id),
        qrValid: true,
        holiday: "ok",
        breakMinimum: `${BREAK_MIN_AFTER_HOURS}h`,
        breakDuration: schedule ? `${Number(schedule.breakMinutes || 60)} min` : "60 min",
        agendaFits: true,
      },
    });
  } catch (err) {
    console.error("scanKioskQr error:", err);
    res.status(500).json({ message: "Impossible d'enregistrer le pointage" });
  }
}

async function getMyAttendanceSummary(req, res) {
  try {
    const userId = req.user.id;
    const schedule = await getWorkerSchedule(userId);
    const events = await getLastEvents(userId, 100);
    const dayOff = await getTodaysDayOff(userId);

    res.json({ ok: true, schedule, dayOff, events });
  } catch (err) {
    console.error("getMyAttendanceSummary error:", err);
    res.status(500).json({ message: "Impossible de charger le résumé" });
  }
}

async function listTeams(req, res) {
  try {
    if (!isAdminLike(req.user)) return res.status(403).json({ message: "Accès réservé" });
    const rows = await prisma.attendanceTeam.findMany({
      include: { assignments: true, schedules: true },
      orderBy: { name: "asc" },
    });
    res.json(rows);
  } catch (err) {
    console.error("listTeams error:", err);
    res.status(500).json({ message: "Impossible de charger les équipes" });
  }
}

async function createTeam(req, res) {
  try {
    if (!isAdminLike(req.user)) return res.status(403).json({ message: "Accès réservé" });
    const name = String(req.body?.name || "").trim();
    const days = Array.isArray(req.body?.days) ? req.body.days.map(Number).filter((n) => Number.isFinite(n)) : [];
    if (!name) return res.status(400).json({ message: "Le nom de l'équipe est requis" });

    const exists = await prisma.attendanceTeam.findFirst({ where: { name } });
    if (exists) return res.status(409).json({ message: "Cette équipe existe déjà" });

    const row = await prisma.attendanceTeam.create({
      data: {
        name,
        assignments: days.length ? { create: days.map((dayOfWeek) => ({ dayOfWeek })) } : undefined,
      },
      include: { assignments: true },
    });

    res.status(201).json(row);
  } catch (err) {
    console.error("createTeam error:", err);
    res.status(500).json({ message: err?.message || "Impossible de créer l'équipe" });
  }
}

async function deleteTeam(req, res) {
  try {
    if (!isAdminLike(req.user)) return res.status(403).json({ message: "Accès réservé" });

    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ message: "id invalide" });

    await prisma.$transaction(async (tx) => {
      await tx.attendanceSchedule.updateMany({
        where: { teamId: id },
        data: { teamId: null },
      });

      await tx.attendanceTeam.delete({
        where: { id },
      });
    });

    res.json({ ok: true });
  } catch (err) {
    console.error("deleteTeam error:", err);
    res.status(500).json({ message: err?.message || "Impossible de supprimer l'équipe" });
  }
}


async function listUsers(req, res) {
  try {
    if (!isAdminLike(req.user)) return res.status(403).json({ message: "Accès réservé" });
    const users = await prisma.user.findMany({
      orderBy: { email: "asc" },
      select: { id: true, email: true, name: true, role: true },
    });
    res.json(users);
  } catch (err) {
    console.error("listUsers error:", err);
    res.status(500).json({ message: "Impossible de charger les utilisateurs" });
  }
}

async function listSchedules(req, res) {
  try {
    if (!isAdminLike(req.user)) return res.status(403).json({ message: "Accès réservé" });
    const schedules = await prisma.attendanceSchedule.findMany({
      orderBy: [{ userId: "asc" }, { dayOfWeek: "asc" }, { updatedAt: "desc" }],
      include: {
        user: { select: { id: true, email: true, name: true, role: true } },
        team: true,
      },
    });
    res.json(schedules);
  } catch (err) {
    console.error("listSchedules error:", err);
    res.status(500).json({ message: "Impossible de charger les horaires" });
  }
}

async function createSchedule(req, res) {
  try {
    if (!isAdminLike(req.user)) return res.status(403).json({ message: "Accès réservé" });
    const body = req.body || {};
    const days = Array.isArray(body.dayOfWeek) ? body.dayOfWeek.map(Number).filter((n) => Number.isFinite(n)) : [];
    if (!days.length) return res.status(400).json({ message: "Au moins un jour est requis" });

    const created = await prisma.$transaction(async (tx) => {
      const rows = [];
      for (const dow of days) {
        const row = await tx.attendanceSchedule.create({
          data: {
            userId: Number(body.userId),
            teamId: body.teamId ? Number(body.teamId) : null,
            dayOfWeek: dow,
            startTime: String(body.startTime || "09:00"),
            endTime: String(body.endTime || "18:00"),
            breakMinAfterHours: Number(body.breakMinAfterHours ?? 2),
            breakMinutes: Number(body.breakMinutes ?? 60),
            manualOverrideAllowed: Boolean(body.manualOverrideAllowed),
            qrWindowMinutes: QR_TTL_MINUTES,
            restaurant: body.restaurant ? String(body.restaurant) : null,
          },
        });
        rows.push(row);
      }
      return rows;
    });

    res.status(201).json(created);
  } catch (err) {
    console.error("createSchedule error:", err);
    res.status(500).json({ message: err?.message || "Impossible de créer l'horaire" });
  }
}

async function updateSchedule(req, res) {
  try {
    if (!isAdminLike(req.user)) return res.status(403).json({ message: "Accès réservé" });
    const id = Number(req.params.id);
    const body = req.body || {};
    const row = await prisma.attendanceSchedule.update({
      where: { id },
      data: {
        userId: body.userId !== undefined ? Number(body.userId) : undefined,
        teamId: body.teamId !== undefined ? (body.teamId ? Number(body.teamId) : null) : undefined,
        dayOfWeek: body.dayOfWeek !== undefined ? Number(body.dayOfWeek) : undefined,
        startTime: body.startTime !== undefined ? String(body.startTime) : undefined,
        endTime: body.endTime !== undefined ? String(body.endTime) : undefined,
        breakMinAfterHours: body.breakMinAfterHours !== undefined ? Number(body.breakMinAfterHours) : undefined,
        breakMinutes: body.breakMinutes !== undefined ? Number(body.breakMinutes) : undefined,
        manualOverrideAllowed: body.manualOverrideAllowed !== undefined ? Boolean(body.manualOverrideAllowed) : undefined,
        qrWindowMinutes: QR_TTL_MINUTES,
        restaurant: body.restaurant !== undefined ? (body.restaurant ? String(body.restaurant) : null) : undefined,
        isActive: body.isActive !== undefined ? Boolean(body.isActive) : undefined,
      },
    });
    res.json(row);
  } catch (err) {
    console.error("updateSchedule error:", err);
    res.status(500).json({ message: "Impossible de modifier l'horaire" });
  }
}

async function deleteSchedule(req, res) {
  try {
    if (!isAdminLike(req.user)) return res.status(403).json({ message: "Accès réservé" });
    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ message: "id invalide" });

    const existing = await prisma.attendanceSchedule.findUnique({ where: { id } });
    if (!existing) return res.status(404).json({ message: "Horaire introuvable" });

    await prisma.$transaction(async (tx) => {
      await tx.attendanceEvent.updateMany({ where: { scheduleId: id }, data: { scheduleId: null } });
      await tx.attendanceQrSession.updateMany({ where: { scheduleId: id }, data: { isOpen: false } });
      await tx.attendanceSchedule.delete({ where: { id } });
    });

    res.json({ ok: true });
  } catch (err) {
    console.error("deleteSchedule error:", err);
    res.status(500).json({ message: err?.message || "Impossible de supprimer l'horaire" });
  }
}

async function listRestaurantHours(req, res) {
  try {
    if (!isAdminLike(req.user)) return res.status(403).json({ message: "Accès réservé" });
    const rows = await prisma.restaurantHours.findMany({ orderBy: { updatedAt: "desc" } });
    res.json(rows);
  } catch (err) {
    console.error("listRestaurantHours error:", err);
    res.status(500).json({ message: "Impossible de charger les horaires du restaurant" });
  }
}

async function createRestaurantHours(req, res) {
  try {
    if (!isAdminLike(req.user)) return res.status(403).json({ message: "Accès réservé" });
    const body = req.body || {};
    const name = String(body.name || "").trim();
    const openDays = Array.isArray(body.openDays) ? body.openDays.map(Number).filter((n) => Number.isFinite(n)) : [];
    if (!name) return res.status(400).json({ message: "Nom requis" });
    if (!openDays.length) return res.status(400).json({ message: "Au moins un jour requis" });

    const row = await prisma.restaurantHours.create({
      data: {
        name,
        openDays,
        openTime: String(body.openTime || "09:00"),
        closeTime: String(body.closeTime || "18:00"),
        isActive: body.isActive !== undefined ? Boolean(body.isActive) : true,
      },
    });
    res.status(201).json(row);
  } catch (err) {
    console.error("createRestaurantHours error:", err);
    res.status(500).json({ message: "Impossible de créer les horaires du restaurant" });
  }
}

async function updateRestaurantHours(req, res) {
  try {
    if (!isAdminLike(req.user)) return res.status(403).json({ message: "Accès réservé" });
    const id = Number(req.params.id);
    const body = req.body || {};
    const row = await prisma.restaurantHours.update({
      where: { id },
      data: {
        name: body.name !== undefined ? String(body.name) : undefined,
        openDays: Array.isArray(body.openDays) ? body.openDays.map(Number).filter((n) => Number.isFinite(n)) : undefined,
        openTime: body.openTime !== undefined ? String(body.openTime) : undefined,
        closeTime: body.closeTime !== undefined ? String(body.closeTime) : undefined,
        isActive: body.isActive !== undefined ? Boolean(body.isActive) : undefined,
      },
    });
    res.json(row);
  } catch (err) {
    console.error("updateRestaurantHours error:", err);
    res.status(500).json({ message: "Impossible de modifier les horaires du restaurant" });
  }
}

async function assignUserToTeam(req, res) {
  try {
    if (!isAdminLike(req.user)) return res.status(403).json({ message: "Accès réservé" });

    const id = Number(req.params.id);
    const teamId = req.body?.teamId ? Number(req.body.teamId) : null;

    if (!id) return res.status(400).json({ message: "id invalide" });

    await prisma.$transaction(async (tx) => {
      await tx.attendanceSchedule.updateMany({
        where: { userId: id },
        data: { teamId },
      });
    });

    const user = await prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
      },
    });

    if (!user) return res.status(404).json({ message: "Worker introuvable" });

    res.json(user);
  } catch (err) {
    console.error("assignUserToTeam error:", err);
    res.status(500).json({ message: err?.message || "Impossible d'assigner le worker à l'équipe" });
  }
}

async function deleteRestaurantHours(req, res) {
  try {
    if (!isAdminLike(req.user)) return res.status(403).json({ message: "Accès réservé" });
    await prisma.restaurantHours.delete({ where: { id: Number(req.params.id) } });
    res.json({ ok: true });
  } catch (err) {
    console.error("deleteRestaurantHours error:", err);
    res.status(500).json({ message: "Impossible de supprimer les horaires du restaurant" });
  }
}

async function listDayOff(req, res) {
  try {
    if (!isAdminLike(req.user)) return res.status(403).json({ message: "Accès réservé" });
    const rows = await prisma.attendanceDayOff.findMany({
      orderBy: { date: "desc" },
      include: { user: { select: { id: true, email: true, name: true, role: true } } },
    });
    res.json(rows);
  } catch (err) {
    console.error("listDayOff error:", err);
    res.status(500).json({ message: "Impossible de charger les congés" });
  }
}

async function createDayOff(req, res) {
  try {
    if (!isAdminLike(req.user)) return res.status(403).json({ message: "Accès réservé" });
    const body = req.body || {};
    const row = await prisma.attendanceDayOff.create({
      data: {
        userId: Number(body.userId),
        date: new Date(body.date),
        reason: body.reason ? String(body.reason) : null,
      },
    });
    res.status(201).json(row);
  } catch (err) {
    console.error("createDayOff error:", err);
    res.status(500).json({ message: "Impossible d'ajouter le congé" });
  }
}

async function deleteDayOff(req, res) {
  try {
    if (!isAdminLike(req.user)) return res.status(403).json({ message: "Accès réservé" });
    await prisma.attendanceDayOff.delete({ where: { id: Number(req.params.id) } });
    res.json({ ok: true });
  } catch (err) {
    console.error("deleteDayOff error:", err);
    res.status(500).json({ message: "Impossible de supprimer le congé" });
  }
}

async function listOverrides(req, res) {
  try {
    if (!isAdminLike(req.user)) return res.status(403).json({ message: "Accès réservé" });
    const rows = await prisma.attendanceOverride.findMany({
      orderBy: { createdAt: "desc" },
      take: 300,
      include: {
        event: {
          include: {
            user: { select: { id: true, email: true, name: true, role: true } },
            schedule: true,
          },
        },
        user: { select: { id: true, email: true, name: true, role: true } },
        schedule: true,
        approver: { select: { id: true, email: true, name: true, role: true } },
      },
    });
    res.json(rows);
  } catch (err) {
    console.error("listOverrides error:", err);
    res.status(500).json({ message: "Impossible de charger les overrides" });
  }
}

async function approveOverride(req, res) {
  try {
    if (!isAdminLike(req.user)) return res.status(403).json({ message: "Accès réservé" });
    const id = Number(req.params.id);
    const { status, reason } = req.body || {};
    const allowed = ["ACCEPTED", "OVERRIDDEN", "REJECTED"];
    if (!allowed.includes(status)) return res.status(400).json({ message: "status invalide" });

    const row = await prisma.$transaction(async (tx) => {
      const override = await tx.attendanceOverride.update({
        where: { id },
        data: {
          status,
          reason: reason ? String(reason) : undefined,
          approvedBy: req.user.id,
        },
      });

      if (override.eventId) {
        await tx.attendanceEvent.update({
          where: { id: override.eventId },
          data: {
            approvalStatus: status,
            isSuspicious: status !== "ACCEPTED" && status !== "OVERRIDDEN" ? true : false,
            rejectionReason: status === "REJECTED" ? reason || null : null,
          },
        });
      }

      return override;
    });

    res.json(row);
  } catch (err) {
    console.error("approveOverride error:", err);
    res.status(500).json({ message: "Impossible de traiter l'override" });
  }
}

async function listSuspiciousEvents(req, res) {
  try {
    if (!isAdminLike(req.user)) return res.status(403).json({ message: "Accès réservé" });
    const events = await prisma.attendanceEvent.findMany({
      where: { OR: [{ isSuspicious: true }, { approvalStatus: "SUSPICIOUS" }, { approvalStatus: "REJECTED" }] },
      orderBy: { eventAt: "desc" },
      take: 300,
      include: {
        user: { select: { id: true, email: true, name: true, role: true } },
        schedule: true,
        session: true,
        override: true,
      },
    });
    res.json(events);
  } catch (err) {
    console.error("listSuspiciousEvents error:", err);
    res.status(500).json({ message: "Impossible de charger les pointages suspects" });
  }
}

function formatDuration(minutes) {
  const safe = Math.max(0, Math.round(minutes));
  const h = Math.floor(safe / 60);
  const m = safe % 60;
  return `${h}h ${String(m).padStart(2, "0")}`;
}

function expectedMinutesForSchedule(schedule) {
  if (!schedule) return 8 * 60;
  const start = parseMinutes(schedule.startTime);
  const end = parseMinutes(schedule.endTime);
  if (start == null || end == null) return 8 * 60;
  return Math.max(60, end >= start ? end - start : 24 * 60 - start + end);
}

async function listAttendanceHistory(req, res) {
  try {
    if (!isAdminLike(req.user)) return res.status(403).json({ message: "Accès réservé" });
    const date = req.query.date ? new Date(`${req.query.date}T00:00:00`) : new Date();
    const { start, end } = toQueryDateRange(date);

    const events = await prisma.attendanceEvent.findMany({
      where: { eventAt: { gte: start, lte: end }, approvalStatus: { in: ["ACCEPTED", "OVERRIDDEN"] } },
      orderBy: { eventAt: "asc" },
      include: {
        user: { select: { id: true, email: true, name: true, role: true } },
        schedule: true,
      },
    });

    const byUser = events.reduce((acc, event) => {
      const key = event.userId;
      if (!acc[key]) acc[key] = [];
      acc[key].push(event);
      return acc;
    }, {});

    const rows = Object.values(byUser).map((userEvents) => {
      const first = userEvents[0];
      const checkIn = userEvents.find((e) => e.eventType === "CHECK_IN") || userEvents[0];
      const checkOut = [...userEvents].reverse().find((e) => e.eventType === "CHECK_OUT");
      const breakStarts = userEvents.filter((e) => e.eventType === "BREAK_START").map((e) => new Date(e.eventAt).getTime());
      const breakEnds = userEvents.filter((e) => e.eventType === "BREAK_END").map((e) => new Date(e.eventAt).getTime());
      let breakMinutes = 0;
      breakStarts.forEach((startMs, index) => {
        const endMs = breakEnds[index];
        if (endMs && endMs > startMs) breakMinutes += (endMs - startMs) / 60000;
      });

      const endMs = checkOut ? new Date(checkOut.eventAt).getTime() : Date.now();
      const totalMinutes = Math.max(0, (endMs - new Date(checkIn.eventAt).getTime()) / 60000);
      const workMinutes = Math.max(0, totalMinutes - breakMinutes);
      const expectedMinutes = expectedMinutesForSchedule(first.schedule);
      const productivity = expectedMinutes > 0
        ? Math.max(100, Math.round(100 + Math.max(0, workMinutes - expectedMinutes) / expectedMinutes * 100))
        : 100;

      return {
        userId: first.userId,
        user: first.user,
        date: localDateKey(start),
        checkIn,
        checkOut,
        breakStarts: userEvents.filter((e) => e.eventType === "BREAK_START"),
        breakEnds: userEvents.filter((e) => e.eventType === "BREAK_END"),
        events: userEvents,
        breakMinutes: Math.round(breakMinutes),
        totalMinutes: Math.round(totalMinutes),
        workMinutes: Math.round(workMinutes),
        expectedMinutes,
        productivity,
        duration: formatDuration(workMinutes),
      };
    });

    res.json({ date: localDateKey(start), rows: rows.sort((a, b) => b.workMinutes - a.workMinutes) });
  } catch (err) {
    console.error("listAttendanceHistory error:", err);
    res.status(500).json({ message: "Impossible de charger l'historique de pointage" });
  }
}

async function listEvents(req, res) {
  try {
    if (!isAdminLike(req.user)) return res.status(403).json({ message: "Accès réservé" });
    const events = await prisma.attendanceEvent.findMany({
      orderBy: { eventAt: "desc" },
      take: 300,
      include: {
        user: { select: { id: true, email: true, name: true, role: true } },
        schedule: true,
        session: true,
        override: true,
      },
    });
    res.json(events);
  } catch (err) {
    console.error("listEvents error:", err);
    res.status(500).json({ message: "Impossible de charger les pointages" });
  }
}

async function manualEvent(req, res) {
  try {
    if (!isAdminLike(req.user)) return res.status(403).json({ message: "Accès réservé" });
    const body = req.body || {};
    const allowed = ["CHECK_IN", "BREAK_START", "BREAK_END", "CHECK_OUT"];
    if (!body.userId || !body.eventType) return res.status(400).json({ message: "userId et eventType requis" });
    if (!allowed.includes(body.eventType)) return res.status(400).json({ message: "eventType invalide" });

    const event = await prisma.attendanceEvent.create({
      data: {
        userId: Number(body.userId),
        scheduleId: body.scheduleId ? Number(body.scheduleId) : null,
        sessionId: body.sessionId ? Number(body.sessionId) : null,
        eventType: body.eventType,
        eventAt: body.eventAt ? new Date(body.eventAt) : new Date(),
        note: body.note ? String(body.note) : null,
        isManual: true,
        isOverride: Boolean(body.isOverride),
        isSuspicious: Boolean(body.isSuspicious),
        approvalStatus: body.isOverride ? "OVERRIDDEN" : "ACCEPTED",
        rejectionReason: body.rejectionReason ? String(body.rejectionReason) : null,
        ipAddress: req.ip || null,
        userAgent: req.headers["user-agent"] || null,
      },
    });

    if (body.isOverride || body.isSuspicious) {
      await prisma.attendanceOverride.create({
        data: {
          eventId: event.id,
          userId: Number(body.userId),
          scheduleId: body.scheduleId ? Number(body.scheduleId) : null,
          reason: body.note || "Override manuel admin",
          approvedBy: req.user.id,
          status: body.isOverride ? "OVERRIDDEN" : "SUSPICIOUS",
          metadata: { isManual: true, adminIp: req.ip },
        },
      });
    }

    res.status(201).json(event);
  } catch (err) {
    console.error("manualEvent error:", err);
    res.status(500).json({ message: "Impossible d'ajouter le pointage manuel" });
  }
}

module.exports = {
  getKioskState,
  openQrSession,
  closeQrSession,
  validateScanRules,
  scanKioskQr,
  getMyAttendanceSummary,
  listTeams,
  createTeam,
  deleteTeam,
  listUsers,
  listSchedules,
  createSchedule,
  updateSchedule,
  deleteSchedule,
  listRestaurantHours,
  createRestaurantHours,
  updateRestaurantHours,
  deleteRestaurantHours,
  listDayOff,
  createDayOff,
  deleteDayOff,
  listEvents,
  manualEvent,
  assignUserToTeam,
  listOverrides,
  approveOverride,
  listSuspiciousEvents,
  listAttendanceHistory,
};