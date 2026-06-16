export function createAlertsHandler({
  nowIso,
  readBody,
  sendJson,
  notFound,
  requireAdmin,
  getAlerts,
  getAllAlerts,
  setAlerts,
  scheduleSave,
  broadcastSnapshot
}) {
  return async function handleAlerts(req, res, { parts, session }) {
    if (req.method === "GET" && parts.length === 2) {
      return sendJson(res, 200, getAlerts(session.user).slice(0, 100));
    }

    if (req.method === "DELETE" && parts.length === 2) {
      if (!requireAdmin(req, res)) return true;
      setAlerts([]);
      scheduleSave();
      broadcastSnapshot();
      return sendJson(res, 200, { ok: true });
    }

    if (req.method === "POST" && parts[3] === "ack") {
      const alert = getAlerts(session.user).find((item) => item.id === parts[2]);
      if (!alert) return notFound(res);
      const payload = await readBody(req);
      alert.read = true;
      alert.acknowledgedAt = nowIso();
      alert.acknowledgedBy = session.user.name;
      alert.acknowledgmentNote = String(payload.note || "").trim().slice(0, 500);
      scheduleSave();
      broadcastSnapshot();
      return sendJson(res, 200, alert);
    }

    if (req.method === "POST" && parts[2] === "read") {
      const acknowledgedAt = nowIso();
      const visibleIds = new Set(getAlerts(session.user).map((alert) => alert.id));
      setAlerts(getAllAlerts().map((alert) => (
        visibleIds.has(alert.id)
          ? {
              ...alert,
              read: true,
              acknowledgedAt: alert.acknowledgedAt || acknowledgedAt,
              acknowledgedBy: alert.acknowledgedBy || session.user.name
            }
          : alert
      )));
      scheduleSave();
      broadcastSnapshot();
      return sendJson(res, 200, { ok: true });
    }

    return false;
  };
}
