export function createAlertsHandler({
  nowIso,
  readBody,
  sendJson,
  notFound,
  requireAdmin,
  getAlerts,
  setAlerts,
  scheduleSave,
  broadcastSnapshot
}) {
  return async function handleAlerts(req, res, { parts, session }) {
    if (req.method === "GET" && parts.length === 2) {
      return sendJson(res, 200, getAlerts().slice(0, 100));
    }

    if (req.method === "DELETE" && parts.length === 2) {
      if (!requireAdmin(req, res)) return true;
      setAlerts([]);
      scheduleSave();
      broadcastSnapshot();
      return sendJson(res, 200, { ok: true });
    }

    if (req.method === "POST" && parts[3] === "ack") {
      const alert = getAlerts().find((item) => item.id === parts[2]);
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
      setAlerts(getAlerts().map((alert) => ({
        ...alert,
        read: true,
        acknowledgedAt: alert.acknowledgedAt || acknowledgedAt,
        acknowledgedBy: alert.acknowledgedBy || session.user.name
      })));
      scheduleSave();
      broadcastSnapshot();
      return sendJson(res, 200, { ok: true });
    }

    return false;
  };
}
