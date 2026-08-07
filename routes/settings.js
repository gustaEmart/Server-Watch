export function createSettingsHandler({
  readBody,
  sendJson,
  requireAdmin,
  getSettings,
  setSettings,
  normalizeBranding,
  normalizeAlertSettings,
  normalizeTicketSlaSettings,
  normalizeTicketAutomationSettings,
  normalizeExpirySettings,
  normalizeDatabaseBackupSettings,
  syncDatabaseBackupWorkerConfig,
  normalizeCloudBackupSettings,
  normalizeProxmoxSettings,
  normalizeUnifiSettings,
  normalizeVaultwardenSettings,
  refreshCloudBackup,
  refreshProxmoxBackup,
  refreshUnifiNetwork,
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

    if (req.method === "PUT" && parts[2] === "ticket-sla") {
      const payload = await readBody(req);
      setSettings(normalizeTicketSlaSettings(payload, getSettings()));
      scheduleSave();
      broadcastSnapshot();
      return sendJson(res, 200, publicSettings(session.user));
    }

    if (req.method === "PUT" && parts[2] === "ticket-automation") {
      const payload = await readBody(req);
      setSettings(normalizeTicketAutomationSettings(payload, getSettings()));
      scheduleSave();
      broadcastSnapshot();
      return sendJson(res, 200, publicSettings(session.user));
    }

    if (req.method === "PUT" && parts[2] === "expirations") {
      const payload = await readBody(req);
      setSettings(normalizeExpirySettings(payload, getSettings()));
      scheduleSave();
      broadcastSnapshot();
      return sendJson(res, 200, publicSettings(session.user));
    }

    if (req.method === "PUT" && parts[2] === "database-backups") {
      const payload = await readBody(req);
      const settings = normalizeDatabaseBackupSettings(payload, getSettings());
      setSettings(settings);
      await syncDatabaseBackupWorkerConfig(settings);
      scheduleSave();
      broadcastSnapshot();
      return sendJson(res, 200, publicSettings(session.user));
    }

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

    if (req.method === "PUT" && parts[2] === "unifi") {
      const payload = await readBody(req);
      setSettings(normalizeUnifiSettings(payload, getSettings()));
      scheduleSave();
      try {
        await refreshUnifiNetwork();
      } catch {
        // A configuracao permanece salva para permitir corrigir a conectividade depois.
      }
      broadcastSnapshot();
      return sendJson(res, 200, publicSettings(session.user));
    }

    if (req.method === "PUT" && parts[2] === "vaultwarden") {
      const payload = await readBody(req);
      setSettings(normalizeVaultwardenSettings(payload, getSettings()));
      scheduleSave();
      broadcastSnapshot();
      return sendJson(res, 200, publicSettings(session.user));
    }

    return false;
  };
}
