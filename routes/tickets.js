export function createTicketsHandler({
  randomId,
  nowIso,
  readBody,
  sendJson,
  notFound,
  requireAdmin,
  isAdminUser,
  canAccessGroup,
  canViewTicket,
  groupHasSupportContract,
  listedTickets,
  scopedTickets,
  publicTicket,
  normalizeTicket,
  applyDefaultTicketSla,
  nextTicketIdentity,
  addTicket,
  appendTicketUpdate,
  scheduleSave,
  broadcastSnapshot
}) {
  const forbidden = (res, message = "Voce nao tem acesso a este chamado.") =>
    sendJson(res, 403, { error: message });

  return async function handleTickets(req, res, { parts, session }) {
    const user = session?.user;
    if (!user) return sendJson(res, 401, { error: "Sessao necessaria." });

    if (req.method === "GET" && parts.length === 2) {
      return sendJson(res, 200, scopedTickets(user).map((ticket) => publicTicket(ticket, user)));
    }

    if (req.method === "POST" && parts.length === 2) {
      const payload = await readBody(req);
      if (!isAdminUser(user)) {
        if (!canAccessGroup(user, payload.groupId)) return forbidden(res, "Empresa nao vinculada ao seu acesso.");
        if (!groupHasSupportContract(payload.groupId)) {
          return forbidden(res, "Esta empresa nao possui contrato de suporte ativo.");
        }
        payload.requesterUserId = user.id;
        payload.requesterName = user.name;
        payload.source = "customer";
        payload.assignedTo = null;
        payload.status = "open";
      }
      const identity = nextTicketIdentity();
      const ticket = applyDefaultTicketSla({
        id: randomId(),
        ticketNumber: identity.number,
        code: identity.code,
        createdAt: nowIso(),
        closedAt: null,
        ...normalizeTicket(payload)
      });
      addTicket(ticket);
      scheduleSave();
      broadcastSnapshot();
      return sendJson(res, 201, publicTicket(ticket, user));
    }

    const id = parts[2];
    const ticket = listedTickets().find((item) => item.id === id);
    if (!ticket) return notFound(res);
    if (!canViewTicket(user, ticket)) return forbidden(res);

    if (req.method === "GET" && parts.length === 3) {
      return sendJson(res, 200, publicTicket(ticket, user));
    }

    if (req.method === "GET" && parts[3] === "attachments" && parts[4]) {
      const attachment = (ticket.attachments || []).find((item) => item.id === parts[4]);
      if (!attachment?.dataUrl) return notFound(res);
      const match = attachment.dataUrl.match(/^data:([^;,]+);base64,(.+)$/);
      if (!match) return notFound(res);
      const body = Buffer.from(match[2], "base64");
      res.writeHead(200, {
        "Content-Type": attachment.type || match[1] || "application/octet-stream",
        "Content-Length": body.length,
        "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(attachment.name || "anexo")}`,
        "Cache-Control": "private, no-store"
      });
      res.end(body);
      return true;
    }

    if (req.method === "PUT" && parts.length === 3) {
      if (!requireAdmin(req, res)) return true;
      const payload = await readBody(req);
      Object.assign(ticket, normalizeTicket(payload, ticket));
      scheduleSave();
      broadcastSnapshot();
      return sendJson(res, 200, publicTicket(ticket, user));
    }

    if (req.method === "POST" && parts[3] === "updates") {
      if (ticket.status === "closed") {
        return sendJson(res, 409, { error: "Reabra o chamado antes de adicionar uma atualizacao." });
      }
      const payload = await readBody(req);
      if (!isAdminUser(user)) {
        payload.visibility = "public";
        delete payload.newStatus;
      }
      appendTicketUpdate(ticket, payload, user);
      scheduleSave();
      broadcastSnapshot();
      return sendJson(res, 200, publicTicket(ticket, user));
    }

    if (req.method === "POST" && parts[3] === "close") {
      if (isAdminUser(user)) return forbidden(res, "Use a atualizacao administrativa para alterar o status.");
      if (["resolved", "closed"].includes(ticket.status)) {
        return sendJson(res, 200, publicTicket(ticket, user));
      }
      appendTicketUpdate(ticket, {
        kind: "status_change",
        message: "Chamado encerrado pelo cliente: apoio nao e mais necessario.",
        newStatus: "closed",
        visibility: "public"
      }, user);
      scheduleSave();
      broadcastSnapshot();
      return sendJson(res, 200, publicTicket(ticket, user));
    }

    if (req.method === "DELETE" && parts.length === 3) {
      if (!requireAdmin(req, res)) return true;
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
