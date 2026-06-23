export function createUnifiNetworkHandler({
  sendJson,
  readBody,
  requireAdmin,
  getUnifiNetworkState,
  refreshUnifiNetwork,
  linkUnifiSite
}) {
  return async function handleUnifiNetwork(req, res, { parts, session }) {
    if (req.method === "GET" && parts.length === 2) {
      return sendJson(res, 200, getUnifiNetworkState(session?.user || null));
    }

    if (req.method === "POST" && parts[2] === "refresh") {
      if (!requireAdmin(req, res)) return true;
      try {
        await refreshUnifiNetwork();
        return sendJson(res, 202, { ok: true, unifiNetwork: getUnifiNetworkState(session?.user || null) });
      } catch (error) {
        return sendJson(res, 502, { error: error.message || "Falha ao atualizar o UniFi Network." });
      }
    }

    if (req.method === "POST" && parts[2] === "link-site") {
      if (!requireAdmin(req, res)) return true;
      const payload = await readBody(req);
      try {
        linkUnifiSite(payload.siteId, payload.groupId ? String(payload.groupId) : null);
        return sendJson(res, 200, { ok: true, unifiNetwork: getUnifiNetworkState(session?.user || null) });
      } catch (error) {
        return sendJson(res, error.statusCode || 400, { error: error.message || "Falha ao vincular site UniFi." });
      }
    }

    return false;
  };
}
