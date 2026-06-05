export function createHealthHandler({ nowIso, uptimeSeconds }) {
  return function healthPayload() {
    return {
      status: "ok",
      service: "serverwatch",
      timestamp: nowIso(),
      uptimeSeconds: uptimeSeconds()
    };
  };
}
