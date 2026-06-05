export function createGroupsHandler({
  randomId,
  nowIso,
  readBody,
  sendJson,
  notFound,
  requireAdmin,
  listedGroups,
  listedServers,
  listedNetworkDevices,
  listedNetworkLinks,
  publicGroup,
  normalizeGroup,
  addGroup,
  scheduleSave,
  broadcastSnapshot
}) {
  return async function handleGroups(req, res, { parts }) {
    if (req.method === "GET" && parts.length === 2) {
      return sendJson(res, 200, listedGroups().map(publicGroup));
    }

    if (req.method !== "GET" && !requireAdmin(req, res)) return true;

    if (req.method === "POST" && parts.length === 2) {
      const payload = await readBody(req);
      const createdAt = nowIso();
      const group = {
        id: randomId(),
        createdAt,
        ...normalizeGroup(payload)
      };
      addGroup(group);
      scheduleSave();
      broadcastSnapshot();
      return sendJson(res, 201, publicGroup(group));
    }

    const id = parts[2];
    const group = listedGroups().find((item) => item.id === id);
    if (!group) return notFound(res);

    if (req.method === "GET" && parts.length === 3) {
      return sendJson(res, 200, publicGroup(group));
    }

    if (req.method === "PUT" && parts.length === 3) {
      const payload = await readBody(req);
      Object.assign(group, normalizeGroup(payload, group));
      scheduleSave();
      broadcastSnapshot();
      return sendJson(res, 200, publicGroup(group));
    }

    if (req.method === "DELETE" && parts.length === 3) {
      const payload = await readBody(req);
      const mode = String(payload.mode || "").trim();
      const now = nowIso();
      const servers = listedServers().filter((server) => server.groupId === group.id);
      const devices = listedNetworkDevices().filter((device) => device.groupId === group.id);
      const links = listedNetworkLinks().filter((link) => link.groupId === group.id);
      const hasRelated = servers.length || devices.length || links.length;

      if (hasRelated && !["detach", "delete_related"].includes(mode)) {
        const error = new Error("Escolha se deseja desvincular ou excluir os servidores, links e dispositivos desta empresa.");
        error.statusCode = 409;
        error.details = {
          serverCount: servers.length,
          networkDeviceCount: devices.length,
          networkLinkCount: links.length
        };
        throw error;
      }

      if (mode === "delete_related") {
        for (const server of servers) {
          server.deletedAt = now;
          server.updatedAt = now;
          server.isActive = false;
        }
        for (const device of devices) {
          device.deletedAt = now;
          device.updatedAt = now;
          device.isActive = false;
        }
        for (const link of links) {
          link.deletedAt = now;
          link.updatedAt = now;
          link.isActive = false;
        }
      } else {
        for (const server of servers) {
          server.groupId = null;
          server.updatedAt = now;
        }
        for (const device of devices) {
          device.groupId = null;
          device.updatedAt = now;
        }
        for (const link of links) {
          link.groupId = null;
          link.updatedAt = now;
        }
      }

      group.deletedAt = now;
      group.updatedAt = now;
      scheduleSave();
      broadcastSnapshot();
      return sendJson(res, 200, {
        group: publicGroup(group),
        mode: hasRelated ? mode : "none",
        affected: {
          serverCount: servers.length,
          networkDeviceCount: devices.length,
          networkLinkCount: links.length
        }
      });
    }

    return false;
  };
}
