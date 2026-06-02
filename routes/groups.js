export function createGroupsHandler({
  randomId,
  nowIso,
  readBody,
  sendJson,
  notFound,
  requireAdmin,
  listedGroups,
  listedServers,
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
      const hasServers = listedServers().some((server) => server.groupId === group.id);
      if (hasServers) {
        const error = new Error("Remova ou reatribua os servidores antes de excluir esta empresa/grupo.");
        error.statusCode = 409;
        throw error;
      }
      group.deletedAt = nowIso();
      group.updatedAt = nowIso();
      scheduleSave();
      broadcastSnapshot();
      return sendJson(res, 200, publicGroup(group));
    }

    return false;
  };
}
