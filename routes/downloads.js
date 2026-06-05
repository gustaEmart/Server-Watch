import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";

function requestPathname(req) {
  const url = new URL(req.url, `http://${req.headers.host}`);
  return decodeURIComponent(url.pathname);
}

export function createDownloadHandler({ downloads, getSession, authorizeProbe, sendJson, notFound }) {
  return async function serveDownload(req, res) {
    const download = downloads[requestPathname(req)];
    if (!download) return notFound(res);
    const session = getSession(req);
    const hasAdminSession = session?.user?.role === "admin";
    const hasProbeToken = download.allowProbeToken && authorizeProbe(req);
    if (!download.public && !hasAdminSession && !hasProbeToken) {
      sendJson(res, session ? 403 : 401, {
        error: session ? "Apenas administradores podem baixar este arquivo." : "Autenticacao necessaria."
      });
      return;
    }

    try {
      const fileStat = await stat(download.path);
      res.writeHead(200, {
        "Content-Type": download.contentType,
        "Content-Length": fileStat.size,
        "Content-Disposition": `attachment; filename="${download.filename}"`,
        "Cache-Control": "no-store"
      });
      createReadStream(download.path).pipe(res);
    } catch {
      notFound(res);
    }
  };
}
