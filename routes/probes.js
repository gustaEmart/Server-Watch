export function createProbesHandler({
  sendJson,
  notFound,
  requireAdmin,
  getProbes,
  listedServers,
  publicProbe,
  publicProbeUpdateRequest,
  probeVersionStatus,
  probeUpdateSupported,
  createProbeUpdateRequest,
  nowIso,
  scheduleSave,
  broadcastSnapshot
}) {
  return function handleProbes(req, res, { parts, session }) {
    if (!requireAdmin(req, res)) return true;

    if (req.method === "GET" && parts.length === 2) {
      return sendJson(res, 200, getProbes().filter((probe) => !probe.deletedAt).map(publicProbe));
    }

    if (req.method === "POST" && parts[2] === "update-outdated") {
      const requestedBy = session.user.name || session.user.email || "Administrador";
      const results = getProbes()
        .filter((probe) => !probe.deletedAt && probeVersionStatus(probe) === "outdated" && probeUpdateSupported(probe))
        .map((probe) => {
          const result = createProbeUpdateRequest(probe, requestedBy);
          return {
            probe: publicProbe(probe),
            request: publicProbeUpdateRequest(result.request),
            created: Boolean(result.created),
            error: result.error || null
          };
        });
      scheduleSave();
      broadcastSnapshot();
      return sendJson(res, 202, { count: results.length, results });
    }

    const id = parts[2];
    const probe = getProbes().find((item) => item.id === id && !item.deletedAt);
    if (!probe) return notFound(res);

    if (req.method === "POST" && parts[3] === "speed-test") {
      if ((probe.probeType || "host") !== "network") {
        return sendJson(res, 400, { error: "Teste de velocidade so esta disponivel para Network Probes." });
      }
      probe.forceSpeedTestAt = nowIso();
      scheduleSave();
      broadcastSnapshot();
      return sendJson(res, 202, { probe: publicProbe(probe) });
    }

    if (req.method === "POST" && parts[3] === "update") {
      const result = createProbeUpdateRequest(probe, session.user.name || session.user.email || "Administrador");
      if (result.error) return sendJson(res, result.status || 400, { error: result.error });
      scheduleSave();
      broadcastSnapshot();
      return sendJson(res, result.created ? 202 : 200, {
        probe: publicProbe(probe),
        request: publicProbeUpdateRequest(result.request)
      });
    }

    if (req.method === "DELETE" && parts.length === 3) {
      const linkedServers = listedServers().filter((server) => server.checkSource === "probe" && server.probeId === probe.id);
      if (linkedServers.length) {
        return sendJson(res, 409, { error: "Reatribua ou remova os servidores vinculados antes de excluir este probe." });
      }
      probe.deletedAt = nowIso();
      probe.updatedAt = probe.deletedAt;
      scheduleSave();
      broadcastSnapshot();
      return sendJson(res, 200, publicProbe(probe));
    }

    return false;
  };
}
