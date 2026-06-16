export function createNetworkHandler({
  randomId,
  nowIso,
  readBody,
  sendJson,
  notFound,
  requireAdmin,
  getDevices,
  getLinks,
  publicDevice,
  publicLink,
  normalizeDevice,
  normalizeLink,
  addDevice,
  addLink,
  scheduleSave,
  broadcastSnapshot
}) {
  return async function handleNetwork(req, res, { parts, session }) {
    if (parts[2] === "devices") {
      if (req.method === "GET" && parts.length === 3) {
        return sendJson(res, 200, getDevices(session.user).filter((device) => !device.deletedAt).map(publicDevice));
      }

      if (req.method === "GET" && parts.length === 4) {
        const device = getDevices(session.user).find((item) => item.id === parts[3] && !item.deletedAt);
        if (!device) return notFound(res);
        return sendJson(res, 200, publicDevice(device));
      }

      if (!requireAdmin(req, res)) return true;

      if (req.method === "POST" && parts.length === 3) {
        const payload = await readBody(req);
        const createdAt = nowIso();
        const device = {
          id: randomId(),
          createdAt,
          updatedAt: createdAt,
          ...normalizeDevice(payload)
        };
        addDevice(device);
        scheduleSave();
        broadcastSnapshot();
        return sendJson(res, 201, publicDevice(device));
      }

      const device = getDevices().find((item) => item.id === parts[3] && !item.deletedAt);
      if (!device) return notFound(res);

      if (req.method === "PUT" && parts.length === 4) {
        const payload = await readBody(req);
        Object.assign(device, normalizeDevice(payload, device), { updatedAt: nowIso() });
        scheduleSave();
        broadcastSnapshot();
        return sendJson(res, 200, publicDevice(device));
      }

      if (req.method === "DELETE" && parts.length === 4) {
        const linkedLinks = getLinks().filter((link) => link.networkDeviceId === device.id && !link.deletedAt);
        if (linkedLinks.length) {
          return sendJson(res, 409, { error: "Remova ou reatribua os links vinculados antes de excluir o dispositivo." });
        }
        device.deletedAt = nowIso();
        device.updatedAt = device.deletedAt;
        scheduleSave();
        broadcastSnapshot();
        return sendJson(res, 200, publicDevice(device));
      }
    }

    if (parts[2] === "links") {
      if (req.method === "GET" && parts.length === 3) {
        return sendJson(res, 200, getLinks(session.user).filter((link) => !link.deletedAt).map(publicLink));
      }

      if (req.method === "GET" && parts.length === 4) {
        const link = getLinks(session.user).find((item) => item.id === parts[3] && !item.deletedAt);
        if (!link) return notFound(res);
        return sendJson(res, 200, publicLink(link));
      }

      if (!requireAdmin(req, res)) return true;

      if (req.method === "POST" && parts.length === 3) {
        const payload = await readBody(req);
        const createdAt = nowIso();
        const link = {
          id: randomId(),
          currentStatus: "unknown",
          previousStatus: "unknown",
          statusChangedAt: createdAt,
          lastCheckedAt: null,
          lastLatencyMs: null,
          lastPacketLossPercent: null,
          lastJitterMs: null,
          lastError: null,
          consecutiveFailures: 0,
          createdAt,
          updatedAt: createdAt,
          ...normalizeLink(payload)
        };
        addLink(link);
        scheduleSave();
        broadcastSnapshot();
        return sendJson(res, 201, publicLink(link));
      }

      const link = getLinks().find((item) => item.id === parts[3] && !item.deletedAt);
      if (!link) return notFound(res);

      if (req.method === "PUT" && parts.length === 4) {
        const payload = await readBody(req);
        Object.assign(link, normalizeLink(payload, link), { updatedAt: nowIso() });
        scheduleSave();
        broadcastSnapshot();
        return sendJson(res, 200, publicLink(link));
      }

      if (req.method === "DELETE" && parts.length === 4) {
        link.isActive = false;
        link.deletedAt = nowIso();
        link.updatedAt = link.deletedAt;
        scheduleSave();
        broadcastSnapshot();
        return sendJson(res, 200, publicLink(link));
      }

      if (req.method === "POST" && parts[4] === "toggle") {
        link.isActive = link.isActive === false;
        link.updatedAt = nowIso();
        if (!link.isActive) {
          link.forceCheckAt = null;
        }
        scheduleSave();
        broadcastSnapshot();
        return sendJson(res, 200, publicLink(link));
      }

      if (req.method === "POST" && parts[4] === "check") {
        if (link.isActive === false) {
          return sendJson(res, 409, { error: "Reative o monitoramento antes de solicitar uma checagem." });
        }
        link.forceCheckAt = nowIso();
        link.updatedAt = link.forceCheckAt;
        scheduleSave();
        broadcastSnapshot();
        return sendJson(res, 202, publicLink(link));
      }
    }

    return false;
  };
}
