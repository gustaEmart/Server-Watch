export function createSettingsHandler({
  readBody,
  sendJson,
  requireAdmin,
  getSettings,
  setSettings,
  normalizeBranding,
  normalizeAlertSettings,
  publicSettings,
  scheduleSave,
  broadcastSnapshot
}) {
  return async function handleSettings(req, res, { parts, session }) {
    if (req.method === "PUT" && parts[2] === "theme") {
      const payload = await readBody(req);
      const current = getSettings();
      setSettings(
        normalizeBranding(
          {
            brandName: current.brandName,
            brandSubtitle: current.brandSubtitle,
            logoDataUrl: current.logoDataUrl,
            theme: payload.theme
          },
          current
        )
      );
      scheduleSave();
      broadcastSnapshot();
      return sendJson(res, 200, publicSettings(session.user));
    }

    if (req.method === "PUT" && parts[2] === "alerts") {
      const payload = await readBody(req);
      setSettings(normalizeAlertSettings(payload, getSettings()));
      scheduleSave();
      broadcastSnapshot();
      return sendJson(res, 200, publicSettings(session.user));
    }

    if (!requireAdmin(req, res)) return true;

    if (req.method === "PUT" && parts[2] === "branding") {
      const payload = await readBody(req);
      setSettings(normalizeBranding(payload, getSettings()));
      scheduleSave();
      broadcastSnapshot();
      return sendJson(res, 200, publicSettings(session.user));
    }

    return false;
  };
}
