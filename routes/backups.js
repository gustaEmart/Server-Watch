export function createBackupsHandler({
  sendJson,
  readBody,
  requireAdmin,
  getCloudBackupState,
  refreshCloudBackup,
  linkCloudBackupClient
}) {
  return async function handleBackups(req, res, { parts, session }) {
    if (req.method === "GET" && parts.length === 2) {
      return sendJson(res, 200, getCloudBackupState(session?.user || null));
    }

    if (req.method === "POST" && parts[2] === "refresh") {
      if (!requireAdmin(req, res)) return true;
      try {
        await refreshCloudBackup();
        return sendJson(res, 202, { ok: true, backups: getCloudBackupState(session?.user || null) });
      } catch (error) {
        return sendJson(res, 502, { error: error.message || "Falha ao atualizar backups." });
      }
    }

    if (req.method === "POST" && parts[2] === "link") {
      if (!requireAdmin(req, res)) return true;
      const payload = await readBody(req);
      try {
        linkCloudBackupClient(payload.clientId, payload.groupId ? String(payload.groupId) : null);
        return sendJson(res, 200, { ok: true, backups: getCloudBackupState(session?.user || null) });
      } catch (error) {
        return sendJson(res, error.statusCode || 400, { error: error.message || "Falha ao vincular cliente." });
      }
    }

    return false;
  };
}
