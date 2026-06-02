export function applyMonitorResult(server, result, options = {}) {
  const checkedAt = options.checkedAt || new Date().toISOString();
  const previousStatus = server.currentStatus || "unknown";
  const failureThreshold = Math.max(1, Number(server.failureThreshold) || 1);

  server.lastCheckedAt = checkedAt;
  server.lastLatencyMs = result.latencyMs ?? null;
  server.lastError = result.error || null;

  if (result.online) {
    server.consecutiveFailures = 0;
    server.currentStatus = "online";
  } else {
    server.consecutiveFailures = (server.consecutiveFailures || 0) + 1;
    if (server.consecutiveFailures >= failureThreshold) {
      server.currentStatus = "offline";
    }
  }

  return {
    previousStatus,
    currentStatus: server.currentStatus || "unknown",
    statusChanged: (server.currentStatus || "unknown") !== previousStatus
  };
}
