export function createServerReadHandler({
  sendJson,
  notFound,
  listedServers,
  publicServer,
  getEvents
}) {
  return function handleServerRead(req, res, { parts, url, session }) {
    if (req.method === "GET" && parts.length === 2) {
      return sendJson(res, 200, listedServers(session.user).map(publicServer));
    }

    if (req.method === "GET" && parts.length === 3) {
      const id = parts[2];
      const server = listedServers(session.user).find((item) => item.id === id);
      if (!server) return notFound(res);
      return sendJson(res, 200, publicServer(server));
    }

    if (req.method === "GET" && parts[3] === "history") {
      const id = parts[2];
      const server = listedServers(session.user).find((item) => item.id === id);
      if (!server) return notFound(res);
      const limit = Number(url.searchParams.get("limit") || 100);
      const events = getEvents(session.user)
        .filter((event) => event.serverId === id)
        .slice(0, Math.min(limit, 500));
      return sendJson(res, 200, events);
    }

    return false;
  };
}

export function createServerCreateHandler({
  randomId,
  nowIso,
  nowMs,
  readBody,
  sendJson,
  normalizeServer,
  addServer,
  addAdministrativeEvent,
  syncVirtualizerChildren,
  scheduleSave,
  broadcastSnapshot,
  publicServer
}) {
  return async function handleServerCreate(req, res, { parts, session }) {
    if (req.method !== "POST" || parts.length !== 2) return false;

    const payload = await readBody(req);
    const createdAt = nowIso();
    const server = {
      id: randomId(),
      currentStatus: "unknown",
      previousStatus: "unknown",
      statusChangedAt: createdAt,
      lastCheckedAt: null,
      lastLatencyMs: null,
      lastError: null,
      consecutiveFailures: 0,
      createdAt,
      nextCheckAt: nowMs() + 300,
      ...normalizeServer(payload)
    };
    addServer(server);
    addAdministrativeEvent(server, "server_created", "Servidor cadastrado.", session.user.name);
    const childUpdates = "childIds" in payload ? syncVirtualizerChildren(server, payload.childIds, session.user.name) : 0;
    scheduleSave();
    broadcastSnapshot();
    return sendJson(res, 201, { ...publicServer(server), childUpdates });
  };
}

export function createServerMutationHandler({
  nowIso,
  nowMs,
  readBody,
  sendJson,
  notFound,
  getServer,
  normalizeServer,
  addAdministrativeEvent,
  syncVirtualizerChildren,
  scheduleSave,
  broadcastSnapshot,
  publicServer
}) {
  return async function handleServerMutation(req, res, { parts, session }) {
    const handlesRequest =
      (req.method === "PUT" && parts.length === 3) ||
      (req.method === "DELETE" && parts.length === 3) ||
      (req.method === "POST" && parts[3] === "toggle");
    if (!handlesRequest) return false;

    const id = parts[2];
    const server = getServer(id);
    if (!server) return notFound(res);

    if (req.method === "PUT" && parts.length === 3) {
      const payload = await readBody(req);
      const manuallyRenamedAutoServer =
        server.autoCreatedByProbe &&
        (String(payload.name || "").trim() !== String(server.name || "").trim() ||
          String(payload.hostname || "").trim() !== String(server.hostname || "").trim());
      Object.assign(server, normalizeServer(payload, server));
      if (manuallyRenamedAutoServer) {
        server.autoCreatedByProbe = false;
      }
      addAdministrativeEvent(server, "server_edited", "Cadastro do servidor editado.", session.user.name);
      const childUpdates = "childIds" in payload ? syncVirtualizerChildren(server, payload.childIds, session.user.name) : 0;
      scheduleSave();
      broadcastSnapshot();
      return sendJson(res, 200, { ...publicServer(server), childUpdates });
    }

    if (req.method === "DELETE" && parts.length === 3) {
      server.isActive = false;
      server.deletedAt = nowIso();
      server.updatedAt = nowIso();
      addAdministrativeEvent(server, "server_deleted", "Servidor removido do monitoramento.", session.user.name);
      scheduleSave();
      broadcastSnapshot();
      return sendJson(res, 200, publicServer(server));
    }

    if (req.method === "POST" && parts[3] === "toggle") {
      server.isActive = !server.isActive;
      server.updatedAt = nowIso();
      server.nextCheckAt = nowMs() + 300;
      addAdministrativeEvent(
        server,
        server.isActive ? "server_reactivated" : "server_paused",
        server.isActive ? "Monitoramento reativado." : "Monitoramento pausado.",
        session.user.name
      );
      scheduleSave();
      broadcastSnapshot();
      return sendJson(res, 200, publicServer(server));
    }

    return false;
  };
}

export function createServerCheckHandler({
  nowIso,
  nowMs,
  sendJson,
  notFound,
  getServer,
  publicServer,
  addAdministrativeEvent,
  scheduleSave,
  broadcast,
  summary,
  checkServer
}) {
  return async function handleServerCheck(req, res, { parts, session }) {
    if (req.method !== "POST" || parts[3] !== "check") return false;

    const id = parts[2];
    const server = getServer(id);
    if (!server) return notFound(res);

    if (!server.isActive) {
      return sendJson(res, 409, { error: "Reative o servidor antes de solicitar uma checagem." });
    }
    addAdministrativeEvent(server, "manual_check_requested", "Checagem manual solicitada.", session.user.name);
    if (server.checkSource === "probe") {
      server.probeCheckRequestedAt = nowIso();
      scheduleSave();
      broadcast({ type: "server_checked", server: publicServer(server), summary: summary() });
      return sendJson(res, 202, { status: "probe_queued", server: publicServer(server) });
    }
    server.nextCheckAt = nowMs();
    await checkServer(server);
    return sendJson(res, 200, { status: "checked", server: publicServer(server) });
  };
}
