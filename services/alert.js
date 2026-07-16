export function createAlertService({
  getState,
  randomId,
  nowIso,
  trimEvents,
  broadcast,
  summary,
  publicServer
}) {
  function formatOutageDuration(ms) {
    const totalMinutes = Math.max(0, Math.round(ms / 60000));
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    if (hours && minutes) return `${hours}h ${minutes}min`;
    if (hours) return `${hours}h`;
    if (minutes) return `${minutes}min`;
    return "menos de 1 min";
  }

  function formatClock(iso) {
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return "-";
    return new Intl.DateTimeFormat("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      timeZone: "America/Sao_Paulo"
    }).format(date);
  }

  // Acha o inicio da interrupcao atual: volta no historico ate encontrar a
  // transicao em que o servidor deixou de estar "online", mesmo que ele
  // tenha oscilado entre "offline" e "unknown" (probe sem contato) no meio
  // do caminho. Isso garante que a duracao reportada cubra a interrupcao
  // inteira, nao apenas o ultimo trecho antes da reconexao.
  function outageStart(serverId, beforeMs) {
    const state = getState();
    for (const event of state.events) {
      if (event.serverId !== serverId || event.category !== "technical") continue;
      const eventMs = new Date(event.createdAt).getTime();
      if (!Number.isFinite(eventMs) || eventMs >= beforeMs) continue;
      if (event.currentStatus === "online") return null;
      if (event.previousStatus === "online") return event.createdAt;
    }
    return null;
  }

  function outageInfo(serverId, recoveredAt) {
    const recoveredMs = new Date(recoveredAt || nowIso()).getTime();
    const startedAt = outageStart(serverId, recoveredMs);
    if (!startedAt) return null;
    const startedMs = new Date(startedAt).getTime();
    if (!Number.isFinite(startedMs) || !Number.isFinite(recoveredMs)) return null;
    return { startedAt, durationMs: Math.max(0, recoveredMs - startedMs) };
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
      outageStartedAt: event.outageStartedAt ?? null,
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
    const recovering = currentStatus === "online" && previousStatus !== "online";
    const outage = recovering ? outageInfo(server.id, createdAt) : null;
    const eventMessage =
      outage
        ? `${message ? `${message} ` : ""}Ficou ${formatOutageDuration(outage.durationMs)} sem contato (perdeu contato as ${formatClock(
            outage.startedAt
          )}, retomou as ${formatClock(createdAt)}).`
        : message || null;

    const event = recordEvent({
      category: "technical",
      kind: currentStatus === "offline" ? "server_offline" : currentStatus === "online" ? "server_recovered" : "status_changed",
      serverId: server.id,
      serverName: server.name,
      previousStatus,
      currentStatus,
      latencyMs,
      durationMs: outage?.durationMs ?? null,
      outageStartedAt: outage?.startedAt ?? null,
      message: eventMessage,
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
            ? `${server.name} perdeu contato as ${formatClock(createdAt)} (parou de responder em ${server.hostname}).`
            : outage
            ? `${server.name} voltou a responder em ${server.hostname} as ${formatClock(createdAt)}, apos ${formatOutageDuration(
                outage.durationMs
              )} sem contato (desde ${formatClock(outage.startedAt)}).`
            : `${server.name} voltou a responder em ${server.hostname}.`,
        durationMs: outage?.durationMs ?? null,
        outageStartedAt: outage?.startedAt ?? null,
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
