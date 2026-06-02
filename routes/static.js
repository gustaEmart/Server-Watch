import { readFile } from "node:fs/promises";
import { extname, resolve } from "node:path";
import { getRouteParts } from "../services/http.js";

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon"
};

function withInitialTheme(content, theme) {
  return String(content).replace(
    '<html lang="pt-BR">',
    `<html lang="pt-BR" data-theme="${theme}" style="color-scheme: ${theme};">`
  );
}

export function createStaticHandler({ publicDir, getTheme, notFound }) {
  return async function serveStatic(req, res) {
    const { pathname } = getRouteParts(req);
    const safePath = pathname === "/" ? "/index.html" : pathname;
    const filePath = resolve(publicDir, `.${safePath}`);
    if (!filePath.startsWith(publicDir)) return notFound(res);

    try {
      const content = await readFile(filePath);
      const ext = extname(filePath);
      const body = ext === ".html" ? withInitialTheme(content, getTheme()) : content;
      res.writeHead(200, {
        "Content-Type": MIME_TYPES[ext] || "application/octet-stream",
        "Cache-Control": "no-store"
      });
      res.end(body);
    } catch {
      if (!extname(filePath)) {
        req.url = "/";
        return serveStatic(req, res);
      }
      notFound(res);
    }
  };
}
