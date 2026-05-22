import { createServer } from "node:http";
import { createHash, randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { extname, join, resolve } from "node:path";
import os from "node:os";

const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || "0.0.0.0";
const DATA_DIR = resolve(process.env.DATA_DIR || "data");
const DATA_FILE = join(DATA_DIR, "serverwatch.json");
const PUBLIC_DIR = resolve("public");
const DOWNLOADS = {
  "/downloads/probe/linux-installer": {
    path: resolve("tools/probe/install-linux.sh"),
    filename: "serverwatch-probe-install-linux.sh",
    contentType: "text/x-shellscript; charset=utf-8"
  },
  "/downloads/probe/windows-installer": {
    path: resolve(process.env.SERVERWATCH_WINDOWS_INSTALLER_PATH || "downloads/ServerWatchProbeSetup.exe"),
    filename: "ServerWatchProbeSetup.exe",
    contentType: "application/vnd.microsoft.portable-executable"
  }
};
const CHECK_LOOP_MS = 1000;
const MAX_HISTORY_PER_SERVER = 500;
const CHECK_SOURCES = new Set(["serverwatch", "probe"]);

const sockets = new Set();
let state = {
  servers: [],
  groups: [],
  probes: [],
  events: [],
  alerts: [],
  settings: {
    defaultInterval: 10,
    defaultFailureThreshold: 2,
    probeToken: randomUUID()
  }
};
let saveTimer = null;

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon"
};

function nowIso() {
  return new Date().toISOString();
}

function normalizeTags(input) {
  if (Array.isArray(input)) {
    return input.map((tag) => String(tag).trim()).filter(Boolean);
  }
  return String(input || "")
    .split(",")
    .map((tag) => tag.trim())
    .filter(Boolean);
}

function normalizeCheckSource(value, fallback = "serverwatch") {
  const source = String(value || fallback || "serverwatch").trim();
  return CHECK_SOURCES.has(source) ? source : "serverwatch";
}

function normalizeServer(payload, existing = {}) {
  const hostname = String(payload.hostname || existing.hostname || "").trim();
  if (!hostname) {
    const error = new Error("Informe IP ou hostname do servidor.");
    error.statusCode = 400;
    throw error;
  }

  if (!/^[a-zA-Z0-9._:-]+$/.test(hostname)) {
    const error = new Error("Hostname invalido. Use apenas letras, numeros, ponto, hifen, underline ou dois-pontos.");
    error.statusCode = 400;
    throw error;
  }

  const interval = Number(payload.checkInterval ?? payload.check_interval ?? existing.checkInterval ?? state.settings.defaultInterval);
  const threshold = Number(payload.failureThreshold ?? payload.failure_threshold ?? existing.failureThreshold ?? state.settings.defaultFailureThreshold);
  const rawGroupId = payload.groupId ?? payload.group_id ?? existing.groupId ?? null;
  const groupId = rawGroupId && rawGroupId !== "none" ? String(rawGroupId) : null;
  const checkSource = normalizeCheckSource(payload.checkSource ?? payload.check_source, existing.checkSource);
  const probeId = String(payload.probeId ?? payload.probe_id ?? existing.probeId ?? "").trim();

  if (groupId && !listedGroups().some((group) => group.id === groupId)) {
    const error = new Error("Empresa/grupo informado nao existe.");
    error.statusCode = 400;
    throw error;
  }

  return {
    ...existing,
    name: String(payload.name || existing.name || hostname).trim(),
    hostname,
    description: String(payload.description ?? existing.description ?? "").trim(),
    checkMethod: "ping",
    checkSource,
    probeId: checkSource === "probe" ? probeId : null,
    checkInterval: Math.max(3, Math.min(3600, Number.isFinite(interval) ? interval : state.settings.defaultInterval)),
    failureThreshold: Math.max(1, Math.min(10, Number.isFinite(threshold) ? threshold : state.settings.defaultFailureThreshold)),
    environment: String(payload.environment || existing.environment || "production"),
    groupId,
    location: String(payload.location ?? existing.location ?? "").trim(),
    tags: normalizeTags(payload.tags ?? existing.tags ?? []),
    isActive: Boolean(payload.isActive ?? payload.is_active ?? existing.isActive ?? true),
    updatedAt: nowIso()
  };
}

function normalizeGroup(payload, existing = {}) {
  const name = String(payload.name || existing.name || "").trim();
  if (!name) {
    const error = new Error("Informe o nome da empresa/grupo.");
    error.statusCode = 400;
    throw error;
  }

  return {
    ...existing,
    name,
    description: String(payload.description ?? existing.description ?? "").trim(),
    type: String(payload.type || existing.type || "company"),
    updatedAt: nowIso()
  };
}

function createSeedState() {
  const createdAt = nowIso();
  return {
    ...state,
    servers: [
      {
        id: randomUUID(),
        name: "Monitor local",
        hostname: "127.0.0.1",
        description: "Servidor onde o ServerWatch esta rodando.",
        checkMethod: "ping",
        checkSource: "serverwatch",
        probeId: null,
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
        lastProbeSeenAt: null,
        consecutiveFailures: 0,
        createdAt,
        updatedAt: createdAt,
        nextCheckAt: Date.now() + 500
      }
    ],
    groups: [],
    events: [],
    alerts: []
  };
}

async function loadState() {
  await mkdir(DATA_DIR, { recursive: true });
  if (!existsSync(DATA_FILE)) {
    state = createSeedState();
    await persistState();
    return;
  }

  const raw = await readFile(DATA_FILE, "utf8");
  const parsed = JSON.parse(raw);
  state = {
    ...state,
    ...parsed,
    groups: Array.isArray(parsed.groups) ? parsed.groups : [],
    probes: Array.isArray(parsed.probes) ? parsed.probes : [],
    settings: { ...state.settings, ...(parsed.settings || {}) }
  };
  let needsSave = false;
  if (!state.settings.probeToken) {
    state.settings.probeToken = randomUUID();
    needsSave = true;
  }
  const now = Date.now();
  state.servers = state.servers.map((server) => ({
    ...server,
    checkMethod: "ping",
    checkSource: normalizeCheckSource(server.checkSource),
    probeId: server.checkSource === "probe" ? server.probeId || null : null,
    groupId: server.groupId || null,
    nextCheckAt: now + Math.floor(Math.random() * 1500),
    consecutiveFailures: server.consecutiveFailures || 0
  }));
  if (needsSave) await persistState();
}

async function persistState() {
  await mkdir(DATA_DIR, { recursive: true });
  const payload = {
    ...state,
    servers: state.servers.map(({ nextCheckAt, ...server }) => server)
  };
  await writeFile(DATA_FILE, JSON.stringify(payload, null, 2), "utf8");
}

function scheduleSave() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    persistState().catch((error) => console.error("Falha ao salvar estado", error));
  }, 250);
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
  state.events = trimEvents(state.events);

  if (previousStatus !== currentStatus && currentStatus !== "unknown" && previousStatus !== "unknown") {
    const alert = {
      id: randomUUID(),
      serverId: server.id,
      serverName: server.name,
      type: currentStatus === "offline" ? "down" : "recovery",
      severity: currentStatus === "offline" ? "critical" : "info",
      message:
        currentStatus === "offline"
          ? `${server.name} parou de responder em ${server.hostname}.`
          : `${server.name} voltou a responder em ${server.hostname}.`,
      createdAt: event.createdAt,
      read: false
    };
    state.alerts.unshift(alert);
    state.alerts = state.alerts.slice(0, 200);
    broadcast({ type: "alert", alert });
  }

  broadcast({ type: "status_changed", event, server: publicServer(server) });
}

function trimEvents(events) {
  const byServer = new Map();
  const trimmed = [];
  for (const event of events) {
    const count = byServer.get(event.serverId) || 0;
    if (count < MAX_HISTORY_PER_SERVER) {
      trimmed.push(event);
      byServer.set(event.serverId, count + 1);
    }
  }
  return trimmed.slice(0, 5000);
}

function publicServer(server) {
  const group = server.groupId ? listedGroups().find((item) => item.id === server.groupId) : null;
  return {
    id: server.id,
    name: server.name,
    hostname: server.hostname,
    description: server.description,
    checkMethod: server.checkMethod,
    checkSource: server.checkSource || "serverwatch",
    probeId: server.probeId || null,
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
    lastProbeSeenAt: server.lastProbeSeenAt || null,
    consecutiveFailures: server.consecutiveFailures || 0,
    createdAt: server.createdAt,
    updatedAt: server.updatedAt,
    deletedAt: server.deletedAt || null
  };
}

function listedServers() {
  return state.servers.filter((server) => !server.deletedAt);
}

function listedGroups() {
  return state.groups.filter((group) => !group.deletedAt);
}

function publicGroup(group) {
  const servers = listedServers().filter((server) => server.groupId === group.id);
  const activeServers = servers.filter((server) => server.isActive);
  return {
    id: group.id,
    name: group.name,
    description: group.description,
    type: group.type || "company",
    serverCount: servers.length,
    activeServerCount: activeServers.length,
    offlineCount: activeServers.filter((server) => server.currentStatus === "offline").length,
    createdAt: group.createdAt,
    updatedAt: group.updatedAt,
    deletedAt: group.deletedAt || null
  };
}

function summary() {
  const servers = listedServers();
  const activeServers = servers.filter((server) => server.isActive);
  const total = activeServers.length;
  const online = activeServers.filter((server) => server.currentStatus === "online").length;
  const offline = activeServers.filter((server) => server.currentStatus === "offline").length;
  const unknown = activeServers.filter((server) => !server.currentStatus || server.currentStatus === "unknown").length;
  const last24h = Date.now() - 24 * 60 * 60 * 1000;
  const dayEvents = state.events.filter((event) => new Date(event.createdAt).getTime() >= last24h);
  const onlineEvents = dayEvents.filter((event) => event.currentStatus === "online").length;
  const availability24h = dayEvents.length ? Math.round((onlineEvents / dayEvents.length) * 1000) / 10 : total ? Math.round((online / total) * 1000) / 10 : 0;

  return {
    totalServers: total,
    online,
    offline,
    unknown,
    inactive: servers.length - total,
    availability24h,
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
    probes: (state.probes || []).map(publicProbe),
    settings: publicSettings(),
    alerts: state.alerts.slice(0, 50),
    events: state.events.slice(0, 100)
  };
}

function buildPingArgs(hostname, timeoutMs) {
  if (os.platform() === "win32") {
    return ["-n", "1", "-w", String(timeoutMs), hostname];
  }
  const seconds = Math.max(1, Math.ceil(timeoutMs / 1000));
  return ["-c", "1", "-W", String(seconds), hostname];
}

function parseLatency(output) {
  const match = output.match(/(?:time|tempo)[=<]\s*([\d.,]+)\s*ms/i);
  if (!match) return null;
  return Math.round(Number(match[1].replace(",", ".")));
}

function pingFailureReason(output) {
  const checks = [
    [/request timed out/i, "Tempo limite esgotado."],
    [/esgotado o tempo limite/i, "Tempo limite esgotado."],
    [/destination host unreachable/i, "Host de destino inacessivel."],
    [/host de destino inacess/i, "Host de destino inacessivel."],
    [/destination net unreachable/i, "Rede de destino inacessivel."],
    [/could not find host/i, "Hostname nao encontrado."],
    [/n.o p.de encontrar o host/i, "Hostname nao encontrado."],
    [/unknown host/i, "Hostname nao encontrado."],
    [/100%\s*(?:loss|de\s+perda)/i, "Sem resposta ao ping."],
    [/(?:received|recebidos)\s*=\s*0/i, "Sem resposta ao ping."],
    [/0\s+(?:received|recebidos)/i, "Sem resposta ao ping."]
  ];

  for (const [pattern, reason] of checks) {
    if (pattern.test(output)) return reason;
  }
  return null;
}

function pingHasReply(output, latencyMs) {
  return (
    latencyMs !== null ||
    /\bttl[=\s]/i.test(output) ||
    /(?:received|recebidos)\s*=\s*[1-9]/i.test(output) ||
    /[1-9]\s+(?:received|recebidos)/i.test(output)
  );
}

function pingHost(hostname, timeoutMs = 2500) {
  return new Promise((resolvePing) => {
    const args = buildPingArgs(hostname, timeoutMs);
    const child = spawn("ping", args, { shell: false });
    let output = "";
    let finished = false;
    const timeout = setTimeout(() => {
      if (!finished) child.kill();
    }, timeoutMs + 1000);

    child.stdout.on("data", (chunk) => {
      output += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      output += chunk.toString();
    });
    child.on("error", (error) => {
      clearTimeout(timeout);
      finished = true;
      resolvePing({ online: false, latencyMs: null, error: error.message });
    });
    child.on("close", (code) => {
      clearTimeout(timeout);
      if (finished) return;
      finished = true;
      const latencyMs = parseLatency(output);
      const failureReason = pingFailureReason(output);
      const hasReply = pingHasReply(output, latencyMs);
      const online = code === 0 && !failureReason && hasReply;
      resolvePing({
        online,
        latencyMs: online ? latencyMs : null,
        error: online ? null : failureReason || "Sem resposta ao ping."
      });
    });
  });
}

async function checkServer(server) {
  if (!server.isActive) return;
  if (server.checkSource === "probe") return;
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
    if (server.consecutiveFailures >= server.failureThreshold) {
      server.currentStatus = "offline";
    }
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
      if (!server.deletedAt && server.isActive && server.checkSource !== "probe" && (!server.nextCheckAt || server.nextCheckAt <= now)) {
        server.nextCheckAt = now + server.checkInterval * 1000;
        checkServer(server).catch((error) => console.error("Falha ao verificar servidor", server.hostname, error));
      }
    }
  }, CHECK_LOOP_MS);
}

function getProbeToken() {
  return String(process.env.SERVERWATCH_PROBE_TOKEN || state.settings.probeToken || "");
}

function authorizeProbe(req) {
  const header = String(req.headers.authorization || "");
  const token = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  return token && token === getProbeToken();
}

function publicProbe(probe) {
  return {
    id: probe.id,
    name: probe.name || probe.id,
    version: probe.version || null,
    lastSeenAt: probe.lastSeenAt || null,
    lastAddress: probe.lastAddress || null,
    targetCount: listedServers().filter((server) => server.checkSource === "probe" && server.probeId === probe.id).length
  };
}

function publicSettings() {
  return {
    probeToken: getProbeToken(),
    probeTokenSource: process.env.SERVERWATCH_PROBE_TOKEN ? "environment" : "generated"
  };
}

function upsertProbe({ probeId, name, version, remoteAddress }) {
  const id = String(probeId || "").trim();
  if (!id) return null;
  const existing = state.probes.find((probe) => probe.id === id);
  const payload = {
    id,
    name: String(name || existing?.name || id).trim(),
    version: String(version || existing?.version || "").trim() || null,
    lastSeenAt: nowIso(),
    lastAddress: remoteAddress || existing?.lastAddress || null
  };
  if (existing) Object.assign(existing, payload);
  else state.probes.push({ createdAt: nowIso(), ...payload });
  return payload;
}

function probeTargets(probeId) {
  return listedServers()
    .filter((server) => server.isActive && server.checkSource === "probe" && server.probeId === probeId)
    .map((server) => ({
      id: server.id,
      name: server.name,
      hostname: server.hostname,
      checkMethod: "ping",
      checkInterval: server.checkInterval,
      failureThreshold: server.failureThreshold
    }));
}

function applyProbeResult(server, result, probeId) {
  const previousStatus = server.currentStatus || "unknown";
  server.lastCheckedAt = result.checkedAt || nowIso();
  server.lastProbeSeenAt = nowIso();
  server.lastLatencyMs = result.latencyMs ?? null;
  server.lastError = result.error || null;

  if (result.online) {
    server.consecutiveFailures = 0;
    server.currentStatus = "online";
  } else {
    server.consecutiveFailures = (server.consecutiveFailures || 0) + 1;
    if (server.consecutiveFailures >= server.failureThreshold) {
      server.currentStatus = "offline";
    }
  }

  if (server.currentStatus !== previousStatus) {
    server.previousStatus = previousStatus;
    server.statusChangedAt = server.lastCheckedAt;
    addEvent(server, previousStatus, server.currentStatus, server.lastLatencyMs, result.error || `Resultado recebido do probe ${probeId}.`);
  } else {
    broadcast({ type: "server_checked", server: publicServer(server), summary: summary() });
  }
}

async function readBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  if (!chunks.length) return {};
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

function notFound(res) {
  sendJson(res, 404, { error: "Recurso nao encontrado." });
}

async function serveDownload(req, res) {
  const { pathname } = getRouteParts(req);
  const download = DOWNLOADS[pathname];
  if (!download) return notFound(res);

  try {
    const content = await readFile(download.path);
    res.writeHead(200, {
      "Content-Type": download.contentType,
      "Content-Length": content.length,
      "Content-Disposition": `attachment; filename="${download.filename}"`,
      "Cache-Control": "no-store"
    });
    res.end(content);
  } catch {
    notFound(res);
  }
}

function getRouteParts(req) {
  const url = new URL(req.url, `http://${req.headers.host}`);
  return {
    url,
    pathname: decodeURIComponent(url.pathname),
    parts: url.pathname.split("/").filter(Boolean)
  };
}

async function handleApi(req, res) {
  const { parts, url } = getRouteParts(req);
  try {
    if (req.method === "GET" && parts.length === 1 && parts[0] === "health") {
      return sendJson(res, 200, {
        status: "ok",
        service: "serverwatch",
        timestamp: nowIso(),
        uptimeSeconds: Math.round(process.uptime())
      });
    }

    if (req.method === "GET" && parts[1] === "summary") {
      return sendJson(res, 200, summary());
    }

    if (req.method === "GET" && parts[1] === "snapshot") {
      return sendJson(res, 200, snapshot());
    }

    if (parts[1] === "probe") {
      if (!authorizeProbe(req)) {
        return sendJson(res, 401, { error: "Token do probe invalido." });
      }

      if (req.method === "GET" && parts[2] === "targets") {
        const probeId = String(url.searchParams.get("probeId") || "").trim();
        const probe = upsertProbe({
          probeId,
          name: url.searchParams.get("name") || probeId,
          version: url.searchParams.get("version") || null,
          remoteAddress: req.socket.remoteAddress
        });
        if (!probe) return sendJson(res, 400, { error: "Informe probeId." });
        scheduleSave();
        return sendJson(res, 200, {
          probe: publicProbe(probe),
          targets: probeTargets(probe.id)
        });
      }

      if (req.method === "POST" && parts[2] === "results") {
        const payload = await readBody(req);
        const probe = upsertProbe({
          probeId: payload.probeId,
          name: payload.name || payload.probeId,
          version: payload.version || null,
          remoteAddress: req.socket.remoteAddress
        });
        if (!probe) return sendJson(res, 400, { error: "Informe probeId." });
        const results = Array.isArray(payload.results) ? payload.results : [];
        let accepted = 0;
        for (const result of results) {
          const server = state.servers.find(
            (item) =>
              item.id === result.serverId &&
              !item.deletedAt &&
              item.checkSource === "probe" &&
              item.probeId === probe.id
          );
          if (!server) continue;
          applyProbeResult(server, result, probe.id);
          accepted += 1;
        }
        scheduleSave();
        return sendJson(res, 200, { ok: true, accepted });
      }
    }

    if (req.method === "GET" && parts[1] === "probes") {
      return sendJson(res, 200, (state.probes || []).map(publicProbe));
    }

    if (parts[1] === "groups") {
      if (req.method === "GET" && parts.length === 2) {
        return sendJson(res, 200, listedGroups().map(publicGroup));
      }

      if (req.method === "POST" && parts.length === 2) {
        const payload = await readBody(req);
        const createdAt = nowIso();
        const group = {
          id: randomUUID(),
          createdAt,
          ...normalizeGroup(payload)
        };
        state.groups.unshift(group);
        scheduleSave();
        broadcast(snapshot());
        return sendJson(res, 201, publicGroup(group));
      }

      const id = parts[2];
      const group = state.groups.find((item) => item.id === id && !item.deletedAt);
      if (!group) return notFound(res);

      if (req.method === "GET" && parts.length === 3) {
        return sendJson(res, 200, publicGroup(group));
      }

      if (req.method === "PUT" && parts.length === 3) {
        const payload = await readBody(req);
        Object.assign(group, normalizeGroup(payload, group));
        scheduleSave();
        broadcast(snapshot());
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
        broadcast(snapshot());
        return sendJson(res, 200, publicGroup(group));
      }
    }

    if (parts[1] === "servers") {
      if (req.method === "GET" && parts.length === 2) {
        return sendJson(res, 200, listedServers().map(publicServer));
      }

      if (req.method === "POST" && parts.length === 2) {
        const payload = await readBody(req);
        const createdAt = nowIso();
        const server = {
          id: randomUUID(),
          currentStatus: "unknown",
          previousStatus: "unknown",
          statusChangedAt: createdAt,
          lastCheckedAt: null,
          lastLatencyMs: null,
          lastError: null,
          consecutiveFailures: 0,
          createdAt,
          nextCheckAt: Date.now() + 300,
          ...normalizeServer(payload)
        };
        state.servers.unshift(server);
        scheduleSave();
        broadcast(snapshot());
        return sendJson(res, 201, publicServer(server));
      }

      const id = parts[2];
      const server = state.servers.find((item) => item.id === id && !item.deletedAt);
      if (!server) return notFound(res);

      if (req.method === "GET" && parts.length === 3) {
        return sendJson(res, 200, publicServer(server));
      }

      if (req.method === "PUT" && parts.length === 3) {
        const payload = await readBody(req);
        Object.assign(server, normalizeServer(payload, server));
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
        const limit = Number(url.searchParams.get("limit") || 100);
        const events = state.events.filter((event) => event.serverId === id).slice(0, Math.min(limit, 500));
        return sendJson(res, 200, events);
      }
    }

    if (req.method === "GET" && parts[1] === "alerts") {
      return sendJson(res, 200, state.alerts.slice(0, 100));
    }

    if (req.method === "POST" && parts[1] === "alerts" && parts[2] === "read") {
      state.alerts = state.alerts.map((alert) => ({ ...alert, read: true }));
      scheduleSave();
      broadcast(snapshot());
      return sendJson(res, 200, { ok: true });
    }

    if (req.method === "GET" && parts[1] === "events") {
      return sendJson(res, 200, state.events.slice(0, 200));
    }

    notFound(res);
  } catch (error) {
    sendJson(res, error.statusCode || 500, { error: error.message || "Erro interno." });
  }
}

async function serveStatic(req, res) {
  const { pathname } = getRouteParts(req);
  const safePath = pathname === "/" ? "/index.html" : pathname;
  const filePath = resolve(PUBLIC_DIR, `.${safePath}`);
  if (!filePath.startsWith(PUBLIC_DIR)) return notFound(res);

  try {
    const content = await readFile(filePath);
    const ext = extname(filePath);
    res.writeHead(200, {
      "Content-Type": mimeTypes[ext] || "application/octet-stream",
      "Cache-Control": "no-store"
    });
    res.end(content);
  } catch {
    if (!extname(filePath)) {
      req.url = "/";
      return serveStatic(req, res);
    }
    notFound(res);
  }
}

function encodeWebSocketFrame(payload) {
  const data = Buffer.from(JSON.stringify(payload));
  if (data.length < 126) {
    return Buffer.concat([Buffer.from([0x81, data.length]), data]);
  }
  if (data.length < 65536) {
    const header = Buffer.alloc(4);
    header[0] = 0x81;
    header[1] = 126;
    header.writeUInt16BE(data.length, 2);
    return Buffer.concat([header, data]);
  }
  const header = Buffer.alloc(10);
  header[0] = 0x81;
  header[1] = 127;
  header.writeBigUInt64BE(BigInt(data.length), 2);
  return Buffer.concat([header, data]);
}

function broadcast(payload) {
  const frame = encodeWebSocketFrame(payload);
  for (const socket of sockets) {
    if (!socket.destroyed) socket.write(frame);
  }
}

function handleUpgrade(req, socket) {
  if (req.url !== "/ws") {
    socket.destroy();
    return;
  }

  const key = req.headers["sec-websocket-key"];
  if (!key) {
    socket.destroy();
    return;
  }

  const accept = createHash("sha1")
    .update(`${key}258EAFA5-E914-47DA-95CA-C5AB0DC85B11`)
    .digest("base64");

  socket.write(
    [
      "HTTP/1.1 101 Switching Protocols",
      "Upgrade: websocket",
      "Connection: Upgrade",
      `Sec-WebSocket-Accept: ${accept}`,
      "",
      ""
    ].join("\r\n")
  );

  sockets.add(socket);
  socket.write(encodeWebSocketFrame(snapshot()));
  socket.on("close", () => sockets.delete(socket));
  socket.on("error", () => sockets.delete(socket));
}

function printStartup() {
  const interfaces = os.networkInterfaces();
  const addresses = [];
  for (const items of Object.values(interfaces)) {
    for (const item of items || []) {
      if (item.family === "IPv4" && !item.internal) addresses.push(item.address);
    }
  }

  console.log("");
  console.log("ServerWatch MVP em execucao");
  console.log(`Local: http://localhost:${PORT}`);
  for (const address of addresses) {
    console.log(`LAN:   http://${address}:${PORT}`);
  }
  console.log("");
}

const server = createServer((req, res) => {
  if (req.url === "/health" || req.url?.startsWith("/api/")) {
    handleApi(req, res);
    return;
  }
  if (req.url?.startsWith("/downloads/")) {
    serveDownload(req, res);
    return;
  }
  serveStatic(req, res);
});

server.on("upgrade", handleUpgrade);

await loadState();
startMonitor();
server.listen(PORT, HOST, printStartup);
