// Modulo de Suporte — 100% administrativo (sem visao de cliente ainda, ver
// plano). Toda rota exige admin, diferente de routes/groups.js que tem GET
// publico escopado por empresa.
export function createTicketsHandler({
  randomId,
  nowIso,
  readBody,
  sendJson,
  notFound,
  requireAdmin,
  listedTickets,
  publicTicket,
  normalizeTicket,
  addTicket,
  appendTicketUpdate,
  scheduleSave,
  broadcastSnapshot
}) {
  return async function handleTickets(req, res, { parts, session }) {
    if (!requireAdmin(req, res)) return true;

    if (req.method === "GET" && parts.length === 2) {
      return sendJson(res, 200, listedTickets().map(publicTicket));
    }

    if (req.method === "POST" && parts.length === 2) {
      const payload = await readBody(req);
      const ticket = {
        id: randomId(),
        createdAt: nowIso(),
        closedAt: null,
        ...normalizeTicket(payload)
      };
      addTicket(ticket);
      scheduleSave();
      broadcastSnapshot();
      return sendJson(res, 201, publicTicket(ticket));
    }

    const id = parts[2];
    const ticket = listedTickets().find((item) => item.id === id);
    if (!ticket) return notFound(res);

    if (req.method === "GET" && parts.length === 3) {
      return sendJson(res, 200, publicTicket(ticket));
    }

    if (req.method === "PUT" && parts.length === 3) {
      const payload = await readBody(req);
      Object.assign(ticket, normalizeTicket(payload, ticket));
      scheduleSave();
      broadcastSnapshot();
      return sendJson(res, 200, publicTicket(ticket));
    }

    if (req.method === "POST" && parts[3] === "updates") {
      const payload = await readBody(req);
      appendTicketUpdate(ticket, payload, session.user.name);
      scheduleSave();
      broadcastSnapshot();
      return sendJson(res, 200, publicTicket(ticket));
    }

    if (req.method === "DELETE" && parts.length === 3) {
      const now = nowIso();
      ticket.deletedAt = now;
      ticket.updatedAt = now;
      scheduleSave();
      broadcastSnapshot();
      return sendJson(res, 200, { ok: true });
    }

    return false;
  };
}
