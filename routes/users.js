export function createUsersHandler({
  randomId,
  nowIso,
  readBody,
  sendJson,
  notFound,
  requireAdmin,
  listedUsers,
  addUser,
  publicUser,
  normalizeUser,
  activeAdminCount,
  scheduleSave
}) {
  return async function handleUsers(req, res, { parts, session }) {
    if (!requireAdmin(req, res)) return true;

    if (req.method === "GET" && parts.length === 2) {
      return sendJson(res, 200, listedUsers().map(publicUser));
    }

    if (req.method === "POST" && parts.length === 2) {
      const payload = await readBody(req);
      const createdAt = nowIso();
      const user = {
        id: randomId(),
        createdAt,
        lastLoginAt: null,
        ...normalizeUser(payload)
      };
      addUser(user);
      scheduleSave();
      return sendJson(res, 201, publicUser(user));
    }

    const id = parts[2];
    const user = listedUsers().find((item) => item.id === id);
    if (!user) return notFound(res);

    if (req.method === "PUT" && parts.length === 3) {
      const payload = await readBody(req);
      const nextRole = String(payload.role || user.role);
      const nextActive = Boolean(payload.isActive ?? user.isActive ?? true);
      if (user.role === "admin" && (!nextActive || nextRole !== "admin") && activeAdminCount() <= 1) {
        return sendJson(res, 409, { error: "Mantenha pelo menos um administrador ativo." });
      }
      Object.assign(user, normalizeUser(payload, user));
      scheduleSave();
      return sendJson(res, 200, publicUser(user));
    }

    if (req.method === "DELETE" && parts.length === 3) {
      if (user.id === session.user.id) {
        return sendJson(res, 409, { error: "Voce nao pode excluir o proprio usuario logado." });
      }
      if (user.role === "admin" && activeAdminCount() <= 1) {
        return sendJson(res, 409, { error: "Mantenha pelo menos um administrador ativo." });
      }
      user.deletedAt = nowIso();
      user.updatedAt = user.deletedAt;
      scheduleSave();
      return sendJson(res, 200, publicUser(user));
    }

    return false;
  };
}
