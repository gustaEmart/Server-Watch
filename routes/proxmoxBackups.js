export function createProxmoxBackupsHandler({
  sendJson,
  readBody,
  requireAdmin,
  getProxmoxBackupState,
  refreshProxmoxBackup,
  linkProxmoxNamespace,
  linkProxmoxServer
}) {
  return async function handleProxmoxBackups(req, res, { parts, session }) {
    if (req.method === "GET" && parts.length === 2) {
      return sendJson(res, 200, getProxmoxBackupState(session?.user || null));
    }

    if (req.method === "POST" && parts[2] === "refresh") {
      if (!requireAdmin(req, res)) return true;
      try {
        await refreshProxmoxBackup();
        return sendJson(res, 202, { ok: true, proxmoxBackup: getProxmoxBackupState(session?.user || null) });
      } catch (error) {
        return sendJson(res, 502, { error: error.message || "Falha ao atualizar o Proxmox Backup Server." });
      }
    }

    if (req.method === "POST" && parts[2] === "link-namespace") {
      if (!requireAdmin(req, res)) return true;
      const payload = await readBody(req);
      try {
        linkProxmoxNamespace(payload.namespace, payload.groupId ? String(payload.groupId) : null);
        return sendJson(res, 200, { ok: true, proxmoxBackup: getProxmoxBackupState(session?.user || null) });
      } catch (error) {
        return sendJson(res, error.statusCode || 400, { error: error.message || "Falha ao vincular namespace." });
      }
    }

    if (req.method === "POST" && parts[2] === "link-server") {
      if (!requireAdmin(req, res)) return true;
      const payload = await readBody(req);
      try {
        linkProxmoxServer(payload.namespace, payload.backupId, payload.serverId ? String(payload.serverId) : null);
        return sendJson(res, 200, { ok: true, proxmoxBackup: getProxmoxBackupState(session?.user || null) });
      } catch (error) {
        return sendJson(res, error.statusCode || 400, { error: error.message || "Falha ao vincular servidor." });
      }
    }

    return false;
  };
}
