export function createProbeCollectorHandler({
  authorizeProbe,
  sendJson,
  readBody,
  nowIso,
  latestVersion,
  upsertProbe,
  ensureProbeServer,
  scheduleSave,
  broadcastSnapshot,
  probeTargets,
  publicProbe,
  getServers,
  applyProbeResult,
  canProbeVerifyServer,
  getProbeUpdateRequests,
  linkedServerForProbe,
  addProbeEvent,
  publicProbeUpdateRequest
}) {
  return async function handleProbeCollector(req, res, { parts, url }) {
    if (!authorizeProbe(req)) {
      sendJson(res, 401, { error: "Token do probe invalido." });
      return true;
    }

    if (req.method === "GET" && parts[2] === "validate") {
      sendJson(res, 200, {
        ok: true,
        service: "serverwatch",
        latestVersion,
        timestamp: nowIso(),
        probeId: String(url.searchParams.get("probeId") || "").trim() || null
      });
      return true;
    }

    if (req.method === "GET" && parts[2] === "targets") {
      const probeId = String(url.searchParams.get("probeId") || "").trim();
      const registered = upsertProbe({
        probeId,
        name: url.searchParams.get("name") || probeId,
        version: url.searchParams.get("version") || null,
        hostName: url.searchParams.get("hostName") || null,
        primaryAddress: url.searchParams.get("primaryAddress") || null,
        addresses: url.searchParams.get("addresses") || [],
        platform: url.searchParams.get("platform") || null,
        primaryMac: url.searchParams.get("primaryMac") || null,
        macAddresses: url.searchParams.get("macAddresses") || [],
        hostMetrics: url.searchParams.get("hostMetrics") || null,
        remoteAddress: req.socket.remoteAddress
      });
      if (!registered) {
        sendJson(res, 400, { error: "Informe probeId." });
        return true;
      }
      const ensuredServer = ensureProbeServer(registered.probe);
      scheduleSave();
      if (registered.changed || ensuredServer.changed) broadcastSnapshot();
      const probeWork = probeTargets(registered.probe.id);
      sendJson(res, 200, {
        probe: publicProbe(registered.probe),
        targets: probeWork.targets,
        updateRequest: probeWork.updateRequest
      });
      return true;
    }

    if (req.method === "POST" && parts[2] === "results") {
      const payload = await readBody(req);
      const registered = upsertProbe({
        probeId: payload.probeId,
        name: payload.name || payload.probeId,
        version: payload.version || null,
        hostName: payload.hostName || null,
        primaryAddress: payload.primaryAddress || null,
        addresses: payload.addresses || [],
        platform: payload.platform || null,
        primaryMac: payload.primaryMac || null,
        macAddresses: payload.macAddresses || [],
        hostMetrics: payload.hostMetrics || null,
        remoteAddress: req.socket.remoteAddress
      });
      if (!registered) {
        sendJson(res, 400, { error: "Informe probeId." });
        return true;
      }
      const probe = registered.probe;
      const ensuredServer = ensureProbeServer(probe);
      const results = Array.isArray(payload.results) ? payload.results : [];
      let accepted = 0;
      for (const result of results) {
        const server = getServers().find(
          (item) =>
            item.id === result.serverId &&
            !item.deletedAt &&
            item.checkSource === "probe"
        );
        if (!server) continue;
        const ownsTarget = server.probeId === probe.id;
        const verifiesPeer = !ownsTarget && canProbeVerifyServer(probe, server);
        if (!ownsTarget && !verifiesPeer) continue;
        applyProbeResult(server, result, probe.id, { verification: verifiesPeer });
        accepted += 1;
      }
      scheduleSave();
      if (registered.changed || ensuredServer.changed || accepted > 0) broadcastSnapshot();
      sendJson(res, 200, { ok: true, accepted });
      return true;
    }

    if (req.method === "POST" && parts[2] === "update-status") {
      const payload = await readBody(req);
      const probeId = String(payload.probeId || "").trim();
      const requestId = String(payload.requestId || "").trim();
      const status = String(payload.status || "").trim();
      const request = getProbeUpdateRequests().find(
        (item) => item.id === requestId && item.probeId === probeId
      );
      if (!request) {
        sendJson(res, 404, { error: "Solicitacao de atualizacao nao encontrada." });
        return true;
      }
      if (!["running", "failed", "unsupported", "succeeded"].includes(status)) {
        sendJson(res, 400, { error: "Status de atualizacao invalido." });
        return true;
      }
      request.status = status;
      request.error = payload.error ? String(payload.error).slice(0, 500) : null;
      if (status === "running") request.startedAt = request.startedAt || nowIso();
      if (["failed", "unsupported", "succeeded"].includes(status)) request.finishedAt = nowIso();
      const server = linkedServerForProbe(probeId);
      if (server && status !== "running") {
        addProbeEvent(
          server,
          `probe_update_${status}`,
          status === "succeeded"
            ? `Atualizacao do probe concluida em ${request.targetVersion}.`
            : `Atualizacao do probe nao foi concluida: ${request.error || status}.`
        );
      }
      scheduleSave();
      broadcastSnapshot();
      sendJson(res, 200, { ok: true, request: publicProbeUpdateRequest(request) });
      return true;
    }

    return false;
  };
}
