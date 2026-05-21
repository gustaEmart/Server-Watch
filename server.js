import { createServer } from "node:http";
import { createHash, randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { extname, join, resolve } from "node:path";
import os from "node:os";

const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || "0.0.0.0";
const DATA_DIR = resolve("data");
const DATA_FILE = join(DATA_DIR, "serverwatch.json");
const PUBLIC_DIR = resolve("public");
const LOOP_MS = 1000;
const MAX_EVENTS = 5000;
const sockets = new Set();
let saveTimer = null;
let state = {
  servers: [],
  groups: [],
  events: [],
  alerts: [],
  settings: { defaultInterval: 10, defaultFailureThreshold: 2 }
};

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8"
};

const nowIso = () => new Date().toISOString();
const listedServers = () => state.servers.filter((server) => !server.deletedAt);
const listedGroups = () => state.groups.filter((group) => !group.deletedAt);

function normalizeTags(value) {
  if (Array.isArray(value)) return value.map((item) => String(item).trim()).filter(Boolean);
  return String(value || "").split(",").map((item) => item.trim()).filter(Boolean);
}

function ensureGroupExists(groupId) {
  if (!groupId) return;
  if (!listedGroups().some((group) => group.id === groupId)) {
    const error = new Error("Empresa/grupo informado nao existe.");
    error.statusCode = 400;
    throw error;
  }
}

function normalizeGroup(payload, current = {}) {
  const name = String(payload.name || current.name || "").trim();
  if (!name) {
    const error = new Error("Informe o nome da empresa/grupo.");
    error.statusCode = 400;
    throw error;
  }
  return {
    ...current,
    name,
    description: String(payload.description ?? current.description ?? "").trim(),
    type: String(payload.type || current.type || "company"),
    updatedAt: nowIso()
  };
}

function normalizeServer(payload, current = {}) {
  const hostname = String(payload.hostname || current.hostname || "").trim();
  if (!hostname) {
    const error = new Error("Informe IP ou hostname do servidor.");
    error.statusCode = 400;
    throw error;
  }
  if (!/^[a-zA-Z0-9._:-]+$/.test(hostname)) {
    const error = new Error("Hostname invalido.");
    error.statusCode = 400;
    throw error;
  }
  const interval = Number(payload.checkInterval ?? current.checkInterval ?? state.settings.defaultInterval);
  const threshold = Number(payload.failureThreshold ?? current.failureThreshold ?? state.settings.defaultFailureThreshold);
  const groupId = payload.groupId || payload.group_id || current.groupId || null;
  ensureGroupExists(groupId);
  return {
    ...current,
    name: String(payload.name || current.name || hostname).trim(),
    hostname,
    description: String(payload.description ?? current.description ?? "").trim(),
    checkMethod: "ping",
    checkInterval: Math.max(3, Math.min(3600, Number.isFinite(interval) ? interval : 10)),
    failureThreshold: Math.max(1, Math.min(10, Number.isFinite(threshold) ? threshold : 2)),
    environment: String(payload.environment || current.environment || "production"),
    groupId: groupId || null,
    location: String(payload.location ?? current.location ?? "").trim(),
    tags: normalizeTags(payload.tags ?? current.tags ?? []),
    isActive: Boolean(payload.isActive ?? current.isActive ?? true),
    updatedAt: nowIso()
  };
}

function seedState() {
  const createdAt = nowIso();
  return {
    ...state,
    servers: [{
      id: randomUUID(),
      name: "Monitor local",
      hostname: "127.0.0.1",
      description: "Servidor onde o ServerWatch esta rodando.",
      checkMethod: "ping",
      checkInterval: 5,
      failureThreshold: 1,
      environment: "production",
      groupId: null,
      location: "LAN",
      tags: ["core", "local"],
      isActive: true,
      currentStatus: "unknown",
      previousStatus: "unknown",
      statusChangedAt: createdAt,
      lastCheckedAt: null,
      lastLatencyMs: null,
      lastError: null,
      consecutiveFailures: 0,
      createdAt,
      updatedAt: createdAt,
      nextCheckAt: Date.now() + 500
    }],
    groups: [],
    events: [],
    alerts: []
  };
}

async function loadState() {
  await mkdir(DATA_DIR, { recursive: true });
  if (!existsSync(DATA_FILE)) {
    state = seedState();
    await persistState();
    return;
  }
  const parsed = JSON.parse(await readFile(DATA_FILE, "utf8"));
  state = { ...state, ...parsed, groups: Array.isArray(parsed.groups) ? parsed.groups : [] };
  const now = Date.now();
  state.servers = state.servers.map((server) => ({
    ...server,
    groupId: server.groupId || null,
    nextCheckAt: now + Math.floor(Math.random() * 1500),
    consecutiveFailures: server.consecutiveFailures || 0
  }));
}

async function persistState() {
  await mkdir(DATA_DIR, { recursive: true });
  const payload = { ...state, servers: state.servers.map(({ nextCheckAt, ...server }) => server) };
  await writeFile(DATA_FILE, JSON.stringify(payload, null, 2), "utf8");
}

function scheduleSave() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => persistState().catch((error) => console.error("Falha ao salvar estado", error)), 250);
}

function publicGroup(group) {
  const servers = listedServers().filter((server) => server.groupId === group.id);
  const active = servers.filter((server) => server.isActive);
  return {
    id: group.id,
    name: group.name,
    description: group.description,
    type: group.type || "company",
    serverCount: servers.length,
    activeServerCount: active.length,
    offlineCount: active.filter((server) => server.currentStatus === "offline").length,
    createdAt: group.createdAt,
    updatedAt: group.updatedAt,
    deletedAt: group.deletedAt || null
  };
}

function publicServer(server) {
  const group = server.groupId ? listedGroups().find((item) => item.id === server.groupId) : null;
  return {
    id: server.id,
    name: server.name,
    hostname: server.hostname,
    description: server.description,
    checkMethod: server.checkMethod,
    checkInterval: server.checkInterval,
    failureThreshold: server.failureThreshold,
    environment: server.environment,
    groupId: server.groupId || null,
    groupName: group?.name || null,
    location: server.location,
    tags: server.tags,
    isActive: server.isActive,
    currentStatus: server.currentStatus || "unknown",
    previousStatus: server.previousStatus || "unknown",
    statusChangedAt: server.statusChangedAt || server.createdAt,
    lastCheckedAt: server.lastCheckedAt,
    lastLatencyMs: server.lastLatencyMs,
    lastError: server.lastError,
    consecutiveFailures: server.consecutiveFailures || 0,
    createdAt: server.createdAt,
    updatedAt: server.updatedAt,
    deletedAt: server.deletedAt || null
  };
}

function summary() {
  const servers = listedServers();
  const active = servers.filter((server) => server.isActive);
  const online = active.filter((server) => server.currentStatus === "online").length;
  const offline = active.filter((server) => server.currentStatus === "offline").length;
  const unknown = active.filter((server) => !server.currentStatus || server.currentStatus === "unknown").length;
  const last24h = Date.now() - 24 * 60 * 60 * 1000;
  const events = state.events.filter((event) => new Date(event.createdAt).getTime() >= last24h);
  const onlineEvents = events.filter((event) => event.currentStatus === "online").length;
  return {
    totalServers: active.length,
    online,
    offline,
    unknown,
    inactive: servers.length - active.length,
    availability24h: events.length ? Math.round((onlineEvents / events.length) * 1000) / 10 : active.length ? Math.round((online / active.length) * 1000) / 10 : 0,
    alertsOpen: state.alerts.filter((alert) => !alert.read && alert.type === "down").length,
    groups: listedGroups().length,
    lastEventAt: state.events[0]?.createdAt || null
  };
}

function snapshot() {
  return {
    type: "snapshot",
    summary: summary(),
    servers: listedServers().map(publicServer),
    groups: listedGroups().map(publicGroup),
    alerts: state.alerts.slice(0, 50),
    events: state.events.slice(0, 100)
  };
}

function addEvent(server, previousStatus, currentStatus, latencyMs, message) {
  const event = {
    id: randomUUID(),
    serverId: server.id,
    serverName: server.name,
    previousStatus,
    currentStatus,
    latencyMs,
    message: message || null,
    createdAt: nowIso()
  };
  state.events.unshift(event);
  state.events = state.events.slice(0, MAX_EVENTS);
  if (previousStatus !== currentStatus && previousStatus !== "unknown" && currentStatus !== "unknown") {
    const alert = {
      id: randomUUID(),
      serverId: server.id,
      serverName: server.name,
      type: currentStatus === "offline" ? "down" : "recovery",
      severity: currentStatus === "offline" ? "critical" : "info",
      message: currentStatus === "offline" ? `${server.name} parou de responder em ${server.hostname}.` : `${server.name} voltou a responder em ${server.hostname}.`,
      createdAt: event.createdAt,
      read: false
    };
    state.alerts.unshift(alert);
    state.alerts = state.alerts.slice(0, 200);
    broadcast({ type: "alert", alert });
  }
  broadcast({ type: "status_changed", event, server: publicServer(server), summary: summary() });
}

function buildPingArgs(hostname, timeoutMs) {
  if (os.platform() === "win32") return ["-n", "1", "-w", String(timeoutMs), hostname];
  return ["-c", "1", "-W", String(Math.max(1, Math.ceil(timeoutMs / 1000))), hostname];
}

function parseLatency(output) {
  const match = output.match(/(?:time|tempo)[=<]\s*([\d.,]+)\s*ms/i);
  return match ? Math.round(Number(match[1].replace(",", "."))) : null;
}

function failureReason(output) {
  const checks = [
    [/request timed out/i, "Tempo limite esgotado."],
    [/esgotado o tempo limite/i, "Tempo limite esgotado."],
    [/destination host unreachable/i, "Host de destino inacessivel."],
    [/destination net unreachable/i, "Rede de destino inacessivel."],
    [/could not find host/i, "Hostname nao encontrado."],
    [/nao .* encontrar o host/i, "Hostname nao encontrado."],
    [/100%\s*(?:loss|de\s+perda)/i, "Sem resposta ao ping."],
    [/(?:received|recebidos)\s*=\s*0/i, "Sem resposta ao ping."],
    [/0\s+(?:received|recebidos)/i, "Sem resposta ao ping."]
  ];
  return checks.find(([pattern]) => pattern.test(output))?.[1] || null;
}

function hasPingReply(output, latencyMs) {
  return latencyMs !== null || /\bttl[=\s]/i.test(output) || /(?:received|recebidos)\s*=\s*[1-9]/i.test(output) || /[1-9]\s+(?:received|recebidos)/i.test(output);
}

function pingHost(hostname, timeoutMs = 2500) {
  return new Promise((resolvePing) => {
    const child = spawn("ping", buildPingArgs(hostname, timeoutMs), { shell: false });
    let output = "";
    const timeout = setTimeout(() => child.kill(), timeoutMs + 1000);
    child.stdout.on("data", (chunk) => { output += chunk.toString(); });
    child.stderr.on("data", (chunk) => { output += chunk.toString(); });
    child.on("error", (error) => {
      clearTimeout(timeout);
      resolvePing({ online: false, latencyMs: null, error: error.message });
    });
    child.on("close", (code) => {
      clearTimeout(timeout);
      const latencyMs = parseLatency(output);
      const reason = failureReason(output);
      const online = code === 0 && !reason && hasPingReply(output, latencyMs);
      resolvePing({ online, latencyMs: online ? latencyMs : null, error: online ? null : reason || "Sem resposta ao ping." });
    });
  });
}

async function checkServer(server) {
  if (!server.isActive) return;
  const previousStatus = server.currentStatus || "unknown";
  const result = await pingHost(server.hostname);
  server.lastCheckedAt = nowIso();
  server.lastLatencyMs = result.latencyMs;
  server.lastError = result.error;
  if (result.online) {
    server.consecutiveFailures = 0;
    server.currentStatus = "online";
  } else {
    server.consecutiveFailures = (server.consecutiveFailures || 0) + 1;
    if (server.consecutiveFailures >= server.failureThreshold) server.currentStatus = "offline";
  }
  if (server.currentStatus !== previousStatus) {
    server.previousStatus = previousStatus;
    server.statusChangedAt = server.lastCheckedAt;
    addEvent(server, previousStatus, server.currentStatus, result.latencyMs, result.error);
  } else {
    broadcast({ type: "server_checked", server: publicServer(server), summary: summary() });
  }
  server.nextCheckAt = Date.now() + server.checkInterval * 1000;
  scheduleSave();
}

function startMonitor() {
  setInterval(() => {
    const now = Date.now();
    for (const server of state.servers) {
      if (!server.deletedAt && server.isActive && (!server.nextCheckAt || server.nextCheckAt <= now)) {
        server.nextCheckAt = now + server.checkInterval * 1000;
        checkServer(server).catch((error) => console.error("Falha ao verificar servidor", server.hostname, error));
      }
    }
  }, LOOP_MS);
}

async function readBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString("utf8");
  return raw ? JSON.parse(raw) : {};
}

function sendJson(res, statusCode, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(body),
    "Cache-Control": "no-store"
  });
  res.end(body);
}

function routeParts(req) {
  const url = new URL(req.url, `http://${req.headers.host}`);
  return { url, parts: url.pathname.split("/").filter(Boolean) };
}

async function handleApi(req, res) {
  const { parts, url } = routeParts(req);
  try {
    if (req.method === "GET" && parts[0] === "health") return sendJson(res, 200, { status: "ok", service: "serverwatch", timestamp: nowIso(), uptimeSeconds: Math.round(process.uptime()) });
    if (req.method === "GET" && parts[1] === "summary") return sendJson(res, 200, summary());
    if (req.method === "GET" && parts[1] === "snapshot") return sendJson(res, 200, snapshot());

    if (parts[1] === "groups") {
      if (req.method === "GET" && parts.length === 2) return sendJson(res, 200, listedGroups().map(publicGroup));
      if (req.method === "POST" && parts.length === 2) {
        const group = { id: randomUUID(), createdAt: nowIso(), ...normalizeGroup(await readBody(req)) };
        state.groups.unshift(group);
        scheduleSave();
        broadcast(snapshot());
        return sendJson(res, 201, publicGroup(group));
      }
      const group = state.groups.find((item) => item.id === parts[2] && !item.deletedAt);
      if (!group) return sendJson(res, 404, { error: "Recurso nao encontrado." });
      if (req.method === "PUT") {
        Object.assign(group, normalizeGroup(await readBody(req), group));
        scheduleSave();
        broadcast(snapshot());
        return sendJson(res, 200, publicGroup(group));
      }
      if (req.method === "DELETE") {
        if (listedServers().some((server) => server.groupId === group.id)) return sendJson(res, 409, { error: "Remova ou reatribua os servidores antes de excluir esta empresa/grupo." });
        group.deletedAt = nowIso();
        group.updatedAt = nowIso();
        scheduleSave();
        broadcast(snapshot());
        return sendJson(res, 200, publicGroup(group));
      }
    }

    if (parts[1] === "servers") {
      if (req.method === "GET" && parts.length === 2) return sendJson(res, 200, listedServers().map(publicServer));
      if (req.method === "POST" && parts.length === 2) {
        const createdAt = nowIso();
        const server = { id: randomUUID(), currentStatus: "unknown", previousStatus: "unknown", statusChangedAt: createdAt, lastCheckedAt: null, lastLatencyMs: null, lastError: null, consecutiveFailures: 0, createdAt, nextCheckAt: Date.now() + 300, ...normalizeServer(await readBody(req)) };
        state.servers.unshift(server);
        scheduleSave();
        broadcast(snapshot());
        return sendJson(res, 201, publicServer(server));
      }
      const server = state.servers.find((item) => item.id === parts[2] && !item.deletedAt);
      if (!server) return sendJson(res, 404, { error: "Recurso nao encontrado." });
      if (req.method === "GET" && parts.length === 3) return sendJson(res, 200, publicServer(server));
      if (req.method === "PUT" && parts.length === 3) {
        Object.assign(server, normalizeServer(await readBody(req), server));
        scheduleSave();
        broadcast(snapshot());
        return sendJson(res, 200, publicServer(server));
      }
      if (req.method === "DELETE" && parts.length === 3) {
        server.isActive = false;
        server.deletedAt = nowIso();
        server.updatedAt = nowIso();
        scheduleSave();
        broadcast(snapshot());
        return sendJson(res, 200, publicServer(server));
      }
      if (req.method === "POST" && parts[3] === "toggle") {
        server.isActive = !server.isActive;
        server.updatedAt = nowIso();
        server.nextCheckAt = Date.now() + 300;
        scheduleSave();
        broadcast(snapshot());
        return sendJson(res, 200, publicServer(server));
      }
      if (req.method === "POST" && parts[3] === "check") {
        server.nextCheckAt = Date.now();
        checkServer(server).catch((error) => console.error("Falha ao verificar manualmente", error));
        return sendJson(res, 202, { status: "queued" });
      }
      if (req.method === "GET" && parts[3] === "history") {
        const limit = Math.min(Number(url.searchParams.get("limit") || 100), 500);
        return sendJson(res, 200, state.events.filter((event) => event.serverId === server.id).slice(0, limit));
      }
    }

    if (req.method === "GET" && parts[1] === "alerts") return sendJson(res, 200, state.alerts.slice(0, 100));
    if (req.method === "POST" && parts[1] === "alerts" && parts[2] === "read") {
      state.alerts = state.alerts.map((alert) => ({ ...alert, read: true }));
      scheduleSave();
      broadcast(snapshot());
      return sendJson(res, 200, { ok: true });
    }
    if (req.method === "GET" && parts[1] === "events") return sendJson(res, 200, state.events.slice(0, 200));

    sendJson(res, 404, { error: "Recurso nao encontrado." });
  } catch (error) {
    sendJson(res, error.statusCode || 500, { error: error.message || "Erro interno." });
  }
}

async function serveStatic(req, res) {
  const { url } = routeParts(req);
  const safePath = decodeURIComponent(url.pathname) === "/" ? "/index.html" : decodeURIComponent(url.pathname);
  const filePath = resolve(PUBLIC_DIR, `.${safePath}`);
  if (!filePath.startsWith(PUBLIC_DIR)) return sendJson(res, 404, { error: "Recurso nao encontrado." });
  try {
    const content = await readFile(filePath);
    res.writeHead(200, { "Content-Type": mimeTypes[extname(filePath)] || "application/octet-stream", "Cache-Control": "no-store" });
    res.end(content);
  } catch {
    res.writeHead(302, { Location: "/" });
    res.end();
  }
}

function encodeFrame(payload) {
  const data = Buffer.from(JSON.stringify(payload));
  if (data.length < 126) return Buffer.concat([Buffer.from([0x81, data.length]), data]);
  const header = Buffer.alloc(4);
  header[0] = 0x81;
  header[1] = 126;
  header.writeUInt16BE(data.length, 2);
  return Buffer.concat([header, data]);
}

function broadcast(payload) {
  const frame = encodeFrame(payload);
  for (const socket of sockets) if (!socket.destroyed) socket.write(frame);
}

function handleUpgrade(req, socket) {
  if (req.url !== "/ws") return socket.destroy();
  const key = req.headers["sec-websocket-key"];
  if (!key) return socket.destroy();
  const accept = createHash("sha1").update(`${key}258EAFA5-E914-47DA-95CA-C5AB0DC85B11`).digest("base64");
  socket.write(["HTTP/1.1 101 Switching Protocols", "Upgrade: websocket", "Connection: Upgrade", `Sec-WebSocket-Accept: ${accept}`, "", ""].join("\r\n"));
  sockets.add(socket);
  socket.write(encodeFrame(snapshot()));
  socket.on("close", () => sockets.delete(socket));
  socket.on("error", () => sockets.delete(socket));
}

function printStartup() {
  const addresses = [];
  for (const items of Object.values(os.networkInterfaces())) for (const item of items || []) if (item.family === "IPv4" && !item.internal) addresses.push(item.address);
  console.log("\nServerWatch MVP em execucao");
  console.log(`Local: http://localhost:${PORT}`);
  for (const address of addresses) console.log(`LAN:   http://${address}:${PORT}`);
  console.log("");
}

const server = createServer((req, res) => {
  if (req.url === "/health" || req.url?.startsWith("/api/")) return void handleApi(req, res);
  serveStatic(req, res);
});

server.on("upgrade", handleUpgrade);
await loadState();
startMonitor();
server.listen(PORT, HOST, printStartup);
