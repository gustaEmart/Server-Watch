export function createAlertService({
  getState,
  randomId,
  nowIso,
  trimEvents,
  broadcast,
  summary,
  publicServer
}) {
  function downtimeDurationMs(serverId, recoveredAt) {
    const state = getState();
    const recoveredMs = new Date(recoveredAt || nowIso()).getTime();
    const lastOffline = state.events.find(
      (event) =>
        event.serverId === serverId &&
        event.category === "technical" &&
        event.kind === "server_offline" &&
        new Date(event.createdAt).getTime() <= recoveredMs
    );
    if (!lastOffline) return null;
    const startedMs = new Date(lastOffline.createdAt).getTime();
    return Number.isFinite(startedMs) && Number.isFinite(recoveredMs) ? Math.max(0, recoveredMs - startedMs) : null;
  }

  function recordEvent(event) {
    const state = getState();
    const payload = {
      id: randomId(),
      category: event.category || "technical",
      kind: event.kind || "status_changed",
      serverId: event.serverId || null,
      serverName: event.serverName || null,
      previousStatus: event.previousStatus || null,
      currentStatus: event.currentStatus || null,
      latencyMs: event.latencyMs ?? null,
      durationMs: event.durationMs ?? null,
      actorName: event.actorName || null,
      message: event.message || null,
      createdAt: event.createdAt || nowIso()
    };
    state.events.unshift(payload);
    state.events = trimEvents(state.events);
    broadcast({ type: "event_created", event: payload, summary: summary() });
    return payload;
  }

  function alertSeverityForServer(server, currentStatus) {
    if (currentStatus !== "offline") return "info";
    const state = getState();
    const byEnvironment = state.settings.alertSeverityByEnvironment || {};
    return byEnvironment[server.environment] || byEnvironment.production || "critical";
  }

  function addEvent(server, previousStatus, currentStatus, latencyMs, message) {
    const state = getState();
    const createdAt = nowIso();
    const event = recordEvent({
      category: "technical",
      kind: currentStatus === "offline" ? "server_offline" : currentStatus === "online" ? "server_recovered" : "status_changed",
      serverId: server.id,
      serverName: server.name,
      previousStatus,
      currentStatus,
      latencyMs,
      durationMs: currentStatus === "online" && previousStatus === "offline" ? downtimeDurationMs(server.id, createdAt) : null,
      message: message || null,
      createdAt
    });

    if (previousStatus !== currentStatus && currentStatus !== "unknown" && previousStatus !== "unknown") {
      const alert = {
        id: randomId(),
        serverId: server.id,
        serverName: server.name,
        type: currentStatus === "offline" ? "down" : "recovery",
        severity: alertSeverityForServer(server, currentStatus),
        message:
          currentStatus === "offline"
            ? `${server.name} parou de responder em ${server.hostname}.`
            : `${server.name} voltou a responder em ${server.hostname}.`,
        createdAt,
        read: false,
        acknowledgedAt: null,
        acknowledgedBy: null,
        acknowledgmentNote: ""
      };
      state.alerts.unshift(alert);
      state.alerts = state.alerts.slice(0, 200);
      broadcast({ type: "alert", alert });
    }

    broadcast({ type: "status_changed", event, server: publicServer(server) });
  }

  function addAdministrativeEvent(server, kind, message, actorName = null) {
    return recordEvent({
      category: "administrative",
      kind,
      serverId: server.id,
      serverName: server.name,
      currentStatus: server.currentStatus || "unknown",
      actorName,
      message
    });
  }

  function addProbeEvent(server, kind, message) {
    return recordEvent({
      category: "technical",
      kind,
      serverId: server.id,
      serverName: server.name,
      currentStatus: server.currentStatus || "unknown",
      message
    });
  }

  return {
    addEvent,
    addAdministrativeEvent,
    addProbeEvent
  };
}
