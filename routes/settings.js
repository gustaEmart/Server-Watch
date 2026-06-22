export function createSettingsHandler({
  readBody,
  sendJson,
  requireAdmin,
  getSettings,
  setSettings,
  normalizeBranding,
  normalizeAlertSettings,
  normalizeCloudBackupSettings,
  normalizeProxmoxSettings,
  refreshCloudBackup,
  refreshProxmoxBackup,
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

    if (req.method === "PUT" && parts[2] === "cloudbackup") {
      const payload = await readBody(req);
      setSettings(normalizeCloudBackupSettings(payload, getSettings()));
      scheduleSave();
      try {
        await refreshCloudBackup();
      } catch {
        // erro ja fica registrado no estado do cloudBackup; nao bloqueia o salvamento
      }
      broadcastSnapshot();
      return sendJson(res, 200, publicSettings(session.user));
    }

    if (req.method === "PUT" && parts[2] === "proxmox") {
      const payload = await readBody(req);
      setSettings(normalizeProxmoxSettings(payload, getSettings()));
      scheduleSave();
      try {
        await refreshProxmoxBackup();
      } catch {
        // erro ja fica registrado no estado do proxmoxBackup; nao bloqueia o salvamento
      }
      broadcastSnapshot();
      return sendJson(res, 200, publicSettings(session.user));
    }

    return false;
  };
}
