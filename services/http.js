export async function readBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  if (!chunks.length) return {};
  const raw = Buffer.concat(chunks).toString("utf8");
  return raw ? JSON.parse(raw) : {};
}

export function sendJson(res, statusCode, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(body),
    "Cache-Control": "no-store"
  });
  res.end(body);
  return true;
}

export function notFound(res) {
  return sendJson(res, 404, { error: "Recurso nao encontrado." });
}

export function getRouteParts(req) {
  const url = new URL(req.url, `http://${req.headers.host}`);
  return {
    url,
    pathname: decodeURIComponent(url.pathname),
    parts: url.pathname.split("/").filter(Boolean)
  };
}
