import { createReadStream } from "node:fs";

export function createDatabaseBackupsHandler({
  readBody,
  sendJson,
  notFound,
  requireAdmin,
  getInfo,
  queueBackup,
  queueRestore,
  resolveArchive
}) {
  return async function handleDatabaseBackups(req, res, { parts }) {
    if (!requireAdmin(req, res)) return true;

    if (req.method === "GET" && parts.length === 2) {
      return sendJson(res, 200, await getInfo());
    }

    if (req.method === "POST" && parts[2] === "run") {
      const request = await queueBackup();
      return sendJson(res, 202, { ok: true, request, info: await getInfo() });
    }

    if (req.method === "POST" && parts[2] === "restore") {
      const payload = await readBody(req);
      if (String(payload.confirmation || "").trim().toUpperCase() !== "RESTAURAR") {
        return sendJson(res, 400, { error: 'Digite "RESTAURAR" para confirmar a restauracao do banco.' });
      }
      const request = await queueRestore(payload.filename);
      return sendJson(res, 202, { ok: true, request, info: await getInfo() });
    }

    if (req.method === "GET" && parts[2] === "download" && parts[3]) {
      const archive = await resolveArchive(decodeURIComponent(parts[3]));
      if (!archive) return notFound(res);
      res.writeHead(200, {
        "Content-Type": "application/gzip",
        "Content-Length": archive.size,
        "Content-Disposition": `attachment; filename="${archive.filename}"`,
        "Cache-Control": "no-store"
      });
      createReadStream(archive.path).pipe(res);
      return true;
    }

    return false;
  };
}
