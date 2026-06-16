export function createMetaHandler({ sendJson, summary, snapshot, getEvents }) {
  return function handleMeta(req, res, { parts, session }) {
    if (req.method === "GET" && parts[1] === "summary") {
      return sendJson(res, 200, summary(session.user));
    }

    if (req.method === "GET" && parts[1] === "snapshot") {
      return sendJson(res, 200, snapshot(session.user));
    }

    if (req.method === "GET" && parts[1] === "events") {
      return sendJson(res, 200, getEvents(session.user).slice(0, 200));
    }

    return false;
  };
}
