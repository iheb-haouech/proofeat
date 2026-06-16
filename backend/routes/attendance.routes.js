const express = require("express");
const router = express.Router();
const controller = require("../controllers/attendance.controller");
const { requireAuth } = require("../middleware/auth");
const { requireAdmin } = require("../middleware/role");

router.get("/kiosk", requireAuth, controller.getKioskState);
router.post("/kiosk/session", requireAuth, requireAdmin, controller.openQrSession);
router.post("/kiosk/session/:id/close", requireAuth, requireAdmin, controller.closeQrSession);
router.post("/kiosk/validate", requireAuth, controller.validateScanRules);
router.post("/kiosk/scan", requireAuth, controller.scanKioskQr);
router.get("/me/summary", requireAuth, controller.getMyAttendanceSummary);

router.get("/admin/teams", requireAuth, requireAdmin, controller.listTeams);
router.post("/admin/teams", requireAuth, requireAdmin, controller.createTeam);
router.delete("/admin/teams/:id", requireAuth, requireAdmin, controller.deleteTeam);

router.get("/admin/schedules", requireAuth, requireAdmin, controller.listSchedules);
router.post("/admin/schedules", requireAuth, requireAdmin, controller.createSchedule);
router.patch("/admin/schedules/:id", requireAuth, requireAdmin, controller.updateSchedule);
router.delete("/admin/schedules/:id", requireAuth, requireAdmin, controller.deleteSchedule);

router.get("/admin/restaurant-hours", requireAuth, requireAdmin, controller.listRestaurantHours);
router.post("/admin/restaurant-hours", requireAuth, requireAdmin, controller.createRestaurantHours);
router.patch("/admin/restaurant-hours/:id", requireAuth, requireAdmin, controller.updateRestaurantHours);
router.delete("/admin/restaurant-hours/:id", requireAuth, requireAdmin, controller.deleteRestaurantHours);

router.get("/admin/day-off", requireAuth, requireAdmin, controller.listDayOff);
router.post("/admin/day-off", requireAuth, requireAdmin, controller.createDayOff);
router.delete("/admin/day-off/:id", requireAuth, requireAdmin, controller.deleteDayOff);

router.get("/admin/overrides", requireAuth, requireAdmin, controller.listOverrides);
router.patch("/admin/overrides/:id", requireAuth, requireAdmin, controller.approveOverride);
router.get("/admin/events/suspicious", requireAuth, requireAdmin, controller.listSuspiciousEvents);
router.get("/admin/events", requireAuth, requireAdmin, controller.listEvents);
router.post("/admin/events/manual", requireAuth, requireAdmin, controller.manualEvent);
router.get("/admin/history", requireAuth, requireAdmin, controller.listAttendanceHistory);

router.get("/admin/users", requireAuth, requireAdmin, controller.listUsers);
module.exports = router;