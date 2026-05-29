import { createServer } from "node:http";
import { createHash, randomUUID, scryptSync, timingSafeEqual } from "node:crypto";
import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import { extname, join, resolve } from "node:path";
import os from "node:os";
import { createStorage } from "./storage/index.js";

const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || "0.0.0.0";
const DATA_DIR = resolve(process.env.DATA_DIR || "data");
const DATA_FILE = join(DATA_DIR, "serverwatch.json");
const STORAGE_TYPE = process.env.SERVERWATCH_STORAGE || (process.env.MONGODB_URI ? "mongodb" : "json");
const PUBLIC_DIR = resolve("public");
const DOWNLOADS = {
  "/downloads/probe/linux-installer": {
    path: resolve("tools/probe/install-linux.sh"),
    filename: "serverwatch-probe-install-linux.sh",
    contentType: "text/x-shellscript; charset=utf-8",
    allowProbeToken: true
  },
  "/downloads/probe/collector.js": {
    path: resolve("probe/collector.js"),
    filename: "collector.js",
    contentType: "text/javascript; charset=utf-8",
    allowProbeToken: true
  },
  "/downloads/probe/setup-server.js": {
    path: resolve("probe/setup-server.js"),
    filename: "setup-server.js",
    contentType: "text/javascript; charset=utf-8",
    allowProbeToken: true
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
const NODE_TYPES = new Set(["server", "physical", "hypervisor", "vm", "service"]);
const INFRASTRUCTURE_PLATFORMS = new Set(["none", "proxmox", "vmware", "hyper-v", "bare-metal", "cloud", "linux", "windows", "other"]);
const SESSION_COOKIE = "sw_session";
const SESSION_TTL_MS = 8 * 60 * 60 * 1000;
const DEFAULT_ADMIN_EMAIL = process.env.SERVERWATCH_ADMIN_EMAIL || "admin@serverwatch.local";
const DEFAULT_ADMIN_PASSWORD = process.env.SERVERWATCH_ADMIN_PASSWORD || "admin123";
const PROBE_COLLECTOR_VERSION = "0.5.0";

const sockets = new Set();
const sessions = new Map();
let state = {
  servers: [],
  groups: [],
  probes: [],
  users: [],
  events: [],
  alerts: [],
  settings: {
    defaultInterval: 10,
    defaultFailureThreshold: 2,
    probeToken: randomUUID(),
    brandName: "ServerWatch",
    brandSubtitle: "MVP LAN",
    logoDataUrl: "",
    theme: "light",
    probeStaleGraceSeconds: 45,
    soundAlertsEnabled: true,
    browserNotificationsEnabled: true,
    alertSeverityByEnvironment: {
      production: "critical",
      staging: "warning",
      development: "info"
    }
  }
};
let saveTimer = null;
let probeStalenessCheckRunning = false;
const storage = createStorage({
  type: STORAGE_TYPE,
  dataFile: DATA_FILE,
  mongoUri: process.env.MONGODB_URI,
  mongoDb: process.env.MONGODB_DB || "serverwatch"
});

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

function normalizeNodeType(value, fallback = "server") {
  const type = String(value || fallback || "server").trim().toLowerCase();
  return NODE_TYPES.has(type) ? type : "server";
}

function normalizeInfrastructurePlatform(value, fallback = "none") {
  const platform = String(value || fallback || "none").trim().toLowerCase();
  return INFRASTRUCTURE_PLATFORMS.has(platform) ? platform : "none";
}

function isDescendantServer(candidateId, ancestorId) {
  let current = state.servers.find((server) => server.id === candidateId && !server.deletedAt);
  const visited = new Set();
  while (current?.parentId) {
    if (current.parentId === ancestorId) return true;
    if (visited.has(current.parentId)) return false;
    visited.add(current.parentId);
    current = state.servers.find((server) => server.id === current.parentId && !server.deletedAt);
  }
  return false;
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
  let groupId = rawGroupId && rawGroupId !== "none" ? String(rawGroupId) : null;
  const checkSource = normalizeCheckSource(payload.checkSource ?? payload.check_source, existing.checkSource);
  const probeId = String(payload.probeId ?? payload.probe_id ?? existing.probeId ?? "").trim();
  const nodeType = normalizeNodeType(payload.nodeType ?? payload.node_type, existing.nodeType);
  const infrastructurePlatform = normalizeInfrastructurePlatform(
    payload.infrastructurePlatform ?? payload.infrastructure_platform,
    existing.infrastructurePlatform
  );
  const rawParentId = payload.parentId ?? payload.parent_id ?? existing.parentId ?? null;
  const parentId = rawParentId && rawParentId !== "none" ? String(rawParentId) : null;

  if (groupId && !listedGroups().some((group) => group.id === groupId)) {
    const error = new Error("Empresa/grupo informado nao existe.");
    error.statusCode = 400;
    throw error;
  }

  if (checkSource === "probe") {
    if (!probeId) {
      const error = new Error("Selecione um probe collector para monitorar este servidor.");
      error.statusCode = 400;
      throw error;
    }
    if (!state.probes.some((probe) => probe.id === probeId)) {
      const error = new Error("Probe collector nao encontrado. Instale o probe antes de associar servidores a ele.");
      error.statusCode = 400;
      throw error;
    }
  }

  if (parentId) {
    if (parentId === existing.id) {
      const error = new Error("Um servidor nao pode depender dele mesmo.");
      error.statusCode = 400;
      throw error;
    }
    const parent = listedServers().find((server) => server.id === parentId);
    if (!parent) {
      const error = new Error("Host pai/virtualizador nao encontrado.");
      error.statusCode = 400;
      throw error;
    }
    if (parent.nodeType !== "hypervisor") {
      const error = new Error("Host pai deve estar marcado como virtualizador.");
      error.statusCode = 400;
      throw error;
    }
    if (existing.id && isDescendantServer(parentId, existing.id)) {
      const error = new Error("Dependencia invalida: isso criaria um ciclo na topologia.");
      error.statusCode = 400;
      throw error;
    }
    if (parent.groupId) {
      groupId = parent.groupId;
    }
  }

  return {
    ...existing,
    name: String(payload.name || existing.name || hostname).trim(),
    hostname,
    description: String(payload.description ?? existing.description ?? "").trim(),
    checkMethod: "ping",
    checkSource,
    probeId: checkSource === "probe" ? probeId : null,
    nodeType,
    infrastructurePlatform,
    parentId,
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

function normalizeBranding(payload, existing = {}) {
  const brandName = String(payload.brandName ?? existing.brandName ?? "ServerWatch").trim() || "ServerWatch";
  const brandSubtitle = String(payload.brandSubtitle ?? existing.brandSubtitle ?? "MVP LAN").trim();
  const logoDataUrl = String(payload.logoDataUrl ?? existing.logoDataUrl ?? "").trim();
  const theme = String(payload.theme ?? existing.theme ?? "light").trim().toLowerCase();

  if (brandName.length > 60) {
    const error = new Error("Nome da marca deve ter no maximo 60 caracteres.");
    error.statusCode = 400;
    throw error;
  }

  if (brandSubtitle.length > 80) {
    const error = new Error("Subtitulo da marca deve ter no maximo 80 caracteres.");
    error.statusCode = 400;
    throw error;
  }

  if (
    logoDataUrl &&
    (!/^data:image\/(?:png|jpeg|jpg|webp|svg\+xml);base64,[a-z0-9+/=]+$/i.test(logoDataUrl) || logoDataUrl.length > 700000)
  ) {
    const error = new Error("Logo invalida. Use PNG, JPG, WEBP ou SVG com ate aproximadamente 500 KB.");
    error.statusCode = 400;
    throw error;
  }

  if (!["light", "dark"].includes(theme)) {
    const error = new Error("Tema invalido. Escolha claro ou escuro.");
    error.statusCode = 400;
    throw error;
  }

  return {
    ...existing,
    brandName,
    brandSubtitle,
    logoDataUrl,
    theme
  };
}

function normalizeAlertSettings(payload = {}, existing = {}) {
  const probeStaleGraceSeconds = Number(payload.probeStaleGraceSeconds ?? existing.probeStaleGraceSeconds ?? 45);
  const defaultFailureThreshold = Number(payload.defaultFailureThreshold ?? existing.defaultFailureThreshold ?? 2);
  const soundAlertsEnabled = Boolean(payload.soundAlertsEnabled ?? existing.soundAlertsEnabled ?? true);
  const browserNotificationsEnabled = Boolean(payload.browserNotificationsEnabled ?? existing.browserNotificationsEnabled ?? true);
  const normalizeSeverity = (value, fallback) => {
    const severity = String(value || fallback || "critical").trim().toLowerCase();
    return ["critical", "warning", "info"].includes(severity) ? severity : fallback;
  };
  const currentSeverity = existing.alertSeverityByEnvironment || {};
  const incomingSeverity = payload.alertSeverityByEnvironment || {};

  if (!Number.isFinite(probeStaleGraceSeconds) || probeStaleGraceSeconds < 15 || probeStaleGraceSeconds > 3600) {
    const error = new Error("Tempo sem contato do probe deve ficar entre 15 e 3600 segundos.");
    error.statusCode = 400;
    throw error;
  }
  if (!Number.isFinite(defaultFailureThreshold) || defaultFailureThreshold < 1 || defaultFailureThreshold > 10) {
    const error = new Error("Falhas padrao antes de offline deve ficar entre 1 e 10.");
    error.statusCode = 400;
    throw error;
  }

  return {
    ...existing,
    probeStaleGraceSeconds: Math.round(probeStaleGraceSeconds),
    defaultFailureThreshold: Math.round(defaultFailureThreshold),
    soundAlertsEnabled,
    browserNotificationsEnabled,
    alertSeverityByEnvironment: {
      production: normalizeSeverity(incomingSeverity.production, currentSeverity.production || "critical"),
      staging: normalizeSeverity(incomingSeverity.staging, currentSeverity.staging || "warning"),
      development: normalizeSeverity(incomingSeverity.development, currentSeverity.development || "info")
    }
  };
}

function normalizeEmail(value) {
  return String(value || "").trim().toLowerCase();
}

function hashPassword(password) {
  const salt = randomUUID().replaceAll("-", "");
  const hash = scryptSync(String(password), salt, 32).toString("base64");
  return `scrypt:${salt}:${hash}`;
}

function verifyPassword(password, storedHash) {
  const [scheme, salt, hash] = String(storedHash || "").split(":");
  if (scheme !== "scrypt" || !salt || !hash) return false;
  const expected = Buffer.from(hash, "base64");
  const actual = scryptSync(String(password), salt, expected.length);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

function publicUser(user) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    isActive: user.isActive !== false,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
    lastLoginAt: user.lastLoginAt || null
  };
}

function listedUsers() {
  return (state.users || []).filter((user) => !user.deletedAt);
}

function activeAdminCount() {
  return listedUsers().filter((user) => user.role === "admin" && user.isActive !== false).length;
}

function ensureDefaultAdmin() {
  state.users = Array.isArray(state.users) ? state.users : [];
  if (listedUsers().some((user) => user.role === "admin")) return false;
  const now = nowIso();
  state.users.push({
    id: randomUUID(),
    name: "Administrador",
    email: normalizeEmail(DEFAULT_ADMIN_EMAIL),
    role: "admin",
    passwordHash: hashPassword(DEFAULT_ADMIN_PASSWORD),
    isActive: true,
    createdAt: now,
    updatedAt: now,
    lastLoginAt: null
  });
  return true;
}

function normalizeUser(payload, existing = {}) {
  const name = String(payload.name || existing.name || "").trim();
  const email = normalizeEmail(payload.email || existing.email);
  const role = String(payload.role || existing.role || "operator");
  const password = String(payload.password || "").trim();

  if (!name) {
    const error = new Error("Informe o nome do usuario.");
    error.statusCode = 400;
    throw error;
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    const error = new Error("Informe um e-mail valido.");
    error.statusCode = 400;
    throw error;
  }
  if (!["admin", "operator"].includes(role)) {
    const error = new Error("Perfil de usuario invalido.");
    error.statusCode = 400;
    throw error;
  }
  if (!existing.id && password.length < 6) {
    const error = new Error("A senha deve ter pelo menos 6 caracteres.");
    error.statusCode = 400;
    throw error;
  }
  if (password && password.length < 6) {
    const error = new Error("A senha deve ter pelo menos 6 caracteres.");
    error.statusCode = 400;
    throw error;
  }
  const duplicate = listedUsers().find((user) => user.email === email && user.id !== existing.id);
  if (duplicate) {
    const error = new Error("Ja existe um usuario com este e-mail.");
    error.statusCode = 409;
    throw error;
  }

  return {
    ...existing,
    name,
    email,
    role,
    isActive: Boolean(payload.isActive ?? existing.isActive ?? true),
    passwordHash: password ? hashPassword(password) : existing.passwordHash,
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
        nodeType: "server",
        infrastructurePlatform: "none",
        parentId: null,
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
    users: [],
    events: [],
    alerts: []
  };
}

async function loadState() {
  const parsed = await storage.loadState();
  if (!parsed) {
    state = createSeedState();
    ensureDefaultAdmin();
    await persistState();
    return;
  }

  state = {
    ...state,
    ...parsed,
    groups: Array.isArray(parsed.groups) ? parsed.groups : [],
    probes: Array.isArray(parsed.probes) ? parsed.probes : [],
    users: Array.isArray(parsed.users) ? parsed.users : [],
    settings: { ...state.settings, ...(parsed.settings || {}) }
  };
  let needsSave = false;
  if (!state.settings.probeToken) {
    state.settings.probeToken = randomUUID();
    needsSave = true;
  }
  const normalizedSettings = normalizeBranding(state.settings, state.settings);
  const normalizedAlertSettings = normalizeAlertSettings(state.settings, normalizedSettings);
  if (
    JSON.stringify(normalizedAlertSettings) !== JSON.stringify(state.settings)
  ) {
    needsSave = true;
  }
  state.settings = normalizedAlertSettings;
  if (ensureDefaultAdmin()) {
    needsSave = true;
  }
  const now = Date.now();
  state.servers = state.servers.map((server) => ({
    ...server,
    checkMethod: "ping",
    checkSource: normalizeCheckSource(server.checkSource),
    probeId: server.checkSource === "probe" ? server.probeId || null : null,
    nodeType: normalizeNodeType(server.nodeType),
    infrastructurePlatform: normalizeInfrastructurePlatform(server.infrastructurePlatform),
    parentId: server.parentId || null,
    groupId: server.groupId || null,
    nextCheckAt: now + Math.floor(Math.random() * 1500),
    consecutiveFailures: server.consecutiveFailures || 0
  }));
  if (needsSave) await persistState();
}

async function persistState() {
  const payload = {
    ...state,
    servers: state.servers.map(({ nextCheckAt, nextProbeFallbackCheckAt, ...server }) => server)
  };
  await storage.saveState(payload);
}

function scheduleSave() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    persistState().catch((error) => console.error("Falha ao salvar estado", error));
  }, 250);
}

function downtimeDurationMs(serverId, recoveredAt) {
  const recoveredMs = new Date(recoveredAt || nowIso()).getTime();
  const lastOffline = state.events.find(
    (event) =>
      event.serverId === serverId &&
      event.category === "technical" &&
      event.kind === "server_offline" &&
      new Date(event.createdAt).getTime() <= recoveredMs
  );
  if (!lastOffline) return null;
  const startedMs = new Date(lastOffline.createdAt).getTime();
  return Number.isFinite(startedMs) && Number.isFinite(recoveredMs) ? Math.max(0, recoveredMs - startedMs) : null;
}

function recordEvent(event) {
  const payload = {
    id: randomUUID(),
    category: event.category || "technical",
    kind: event.kind || "status_changed",
    serverId: event.serverId || null,
    serverName: event.serverName || null,
    previousStatus: event.previousStatus || null,
    currentStatus: event.currentStatus || null,
    latencyMs: event.latencyMs ?? null,
    durationMs: event.durationMs ?? null,
    actorName: event.actorName || null,
    message: event.message || null,
    createdAt: event.createdAt || nowIso()
  };
  state.events.unshift(payload);
  state.events = trimEvents(state.events);
  broadcast({ type: "event_created", event: payload, summary: summary() });
  return payload;
}

function alertSeverityForServer(server, currentStatus) {
  if (currentStatus !== "offline") return "info";
  const byEnvironment = state.settings.alertSeverityByEnvironment || {};
  return byEnvironment[server.environment] || byEnvironment.production || "critical";
}

function addEvent(server, previousStatus, currentStatus, latencyMs, message) {
  const createdAt = nowIso();
  const event = recordEvent({
    category: "technical",
    kind: currentStatus === "offline" ? "server_offline" : currentStatus === "online" ? "server_recovered" : "status_changed",
    serverId: server.id,
    serverName: server.name,
    previousStatus,
    currentStatus,
    latencyMs,
    durationMs: currentStatus === "online" && previousStatus === "offline" ? downtimeDurationMs(server.id, createdAt) : null,
    message: message || null,
    createdAt
  });

  if (previousStatus !== currentStatus && currentStatus !== "unknown" && previousStatus !== "unknown") {
    const alert = {
      id: randomUUID(),
      serverId: server.id,
      serverName: server.name,
      type: currentStatus === "offline" ? "down" : "recovery",
      severity: alertSeverityForServer(server, currentStatus),
      message:
        currentStatus === "offline"
          ? `${server.name} parou de responder em ${server.hostname}.`
          : `${server.name} voltou a responder em ${server.hostname}.`,
      createdAt,
      read: false,
      acknowledgedAt: null,
      acknowledgedBy: null,
      acknowledgmentNote: ""
    };
    state.alerts.unshift(alert);
    state.alerts = state.alerts.slice(0, 200);
    broadcast({ type: "alert", alert });
  }

  broadcast({ type: "status_changed", event, server: publicServer(server) });
}

function addAdministrativeEvent(server, kind, message, actorName = null) {
  return recordEvent({
    category: "administrative",
    kind,
    serverId: server.id,
    serverName: server.name,
    currentStatus: server.currentStatus || "unknown",
    actorName,
    message
  });
}

function addProbeEvent(server, kind, message) {
  return recordEvent({
    category: "technical",
    kind,
    serverId: server.id,
    serverName: server.name,
    currentStatus: server.currentStatus || "unknown",
    message
  });
}

function probeStaleAfterMs(server) {
  const intervalMs = Math.max(3, Number(server.checkInterval || state.settings.defaultInterval || 10)) * 1000;
  const threshold = Math.max(1, Number(server.failureThreshold || state.settings.defaultFailureThreshold || 2));
  const graceMs = Math.max(15, Number(state.settings.probeStaleGraceSeconds || 45)) * 1000;
  return Math.max(graceMs, intervalMs * (threshold + 1) + 15000);
}

function newestTimestamp(...values) {
  return (
    values
      .map((value) => new Date(value || 0).getTime())
      .filter((value) => Number.isFinite(value) && value > 0)
      .sort((a, b) => b - a)[0] || 0
  );
}

function probeConnection(server) {
  if (!server || server.checkSource !== "probe") {
    return { status: "not_applicable", lastSeenAt: null, staleAfterSeconds: null };
  }
  const probe = (state.probes || []).find((item) => item.id === server.probeId);
  const lastSeenMs = newestTimestamp(probe?.lastSeenAt, server.lastProbeSeenAt);
  const staleAfterMs = probeStaleAfterMs(server);
  return {
    status: lastSeenMs && Date.now() - lastSeenMs > staleAfterMs ? "stale" : lastSeenMs ? "online" : "unknown",
    lastSeenAt: lastSeenMs ? new Date(lastSeenMs).toISOString() : null,
    staleAfterSeconds: Math.round(staleAfterMs / 1000)
  };
}

function dependencyInfo(server) {
  if (!server?.parentId) {
    return {
      parentId: null,
      parentName: null,
      parentStatus: null,
      dependencyStatus: "independent",
      dependencyReason: null
    };
  }

  const parent = state.servers.find((item) => item.id === server.parentId && !item.deletedAt);
  if (!parent) {
    return {
      parentId: server.parentId,
      parentName: null,
      parentStatus: "missing",
      dependencyStatus: "orphan",
      dependencyReason: "Host pai removido ou nao encontrado."
    };
  }

  const parentProbe = probeConnection(parent);
  const parentStatus = !parent.isActive
    ? "paused"
    : parentProbe.status === "stale"
    ? "probe_stale"
    : parent.currentStatus || "unknown";
  const affected = parentStatus === "offline" || parentStatus === "probe_stale";
  return {
    parentId: parent.id,
    parentName: parent.name,
    parentStatus,
    dependencyStatus: affected ? "affected" : "ok",
    dependencyReason: affected ? `${parent.name} esta ${parentStatus === "probe_stale" ? "com probe sem contato" : "offline"}.` : null
  };
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
  const probe = probeConnection(server);
  const dependency = dependencyInfo(server);
  const linkedProbe = server.checkSource === "probe"
    ? (state.probes || []).find((item) => item.id === server.probeId && !item.deletedAt)
    : null;
  return {
    id: server.id,
    name: server.name,
    hostname: server.hostname,
    description: server.description,
    checkMethod: server.checkMethod,
    checkSource: server.checkSource || "serverwatch",
    probeId: server.probeId || null,
    nodeType: server.nodeType || "server",
    infrastructurePlatform: server.infrastructurePlatform || "none",
    parentId: dependency.parentId,
    parentName: dependency.parentName,
    parentStatus: dependency.parentStatus,
    dependencyStatus: dependency.dependencyStatus,
    dependencyReason: dependency.dependencyReason,
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
    probeStatus: probe.status,
    probeLastSeenAt: probe.lastSeenAt,
    probeStaleAfterSeconds: probe.staleAfterSeconds,
    probeCheckRequestedAt: server.probeCheckRequestedAt || null,
    probeHostMetrics: linkedProbe?.hostMetrics || null,
    probeHostMetricsUpdatedAt: linkedProbe?.hostMetricsUpdatedAt || null,
    probeHostName: linkedProbe?.hostName || null,
    platform: server.platform || null,
    primaryMac: server.primaryMac || null,
    macAddresses: Array.isArray(server.macAddresses) ? server.macAddresses : [],
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

function snapshot(currentUser = null) {
  return {
    type: "snapshot",
    summary: summary(),
    servers: listedServers().map(publicServer),
    groups: listedGroups().map(publicGroup),
    probes: currentUser?.role === "admin" ? (state.probes || []).filter((probe) => !probe.deletedAt).map(publicProbe) : [],
    users: currentUser?.role === "admin" ? listedUsers().map(publicUser) : [],
    currentUser: currentUser ? publicUser(currentUser) : null,
    settings: publicSettings(currentUser),
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

function ipv4ToInt(address) {
  const parts = String(address || "").split(".").map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return null;
  return parts.reduce((acc, part) => ((acc << 8) | part) >>> 0, 0);
}

function isIpv4Address(value) {
  return ipv4ToInt(value) !== null;
}

function localSubnets() {
  return Object.values(os.networkInterfaces())
    .flatMap((items) => items || [])
    .filter((item) => item.family === "IPv4" && !item.internal && item.address && item.netmask)
    .map((item) => ({
      address: ipv4ToInt(item.address),
      mask: ipv4ToInt(item.netmask)
    }))
    .filter((item) => item.address !== null && item.mask !== null);
}

function isLocalNetworkTarget(hostname) {
  const target = ipv4ToInt(hostname);
  if (target === null) return false;
  return localSubnets().some((subnet) => (target & subnet.mask) === (subnet.address & subnet.mask));
}

function sameIpv4Slash24(left, right) {
  const leftInt = ipv4ToInt(left);
  const rightInt = ipv4ToInt(right);
  if (leftInt === null || rightInt === null) return false;
  return (leftInt & 0xffffff00) === (rightInt & 0xffffff00);
}

function uniqueIpv4Addresses(values) {
  return [...new Set(values.map((value) => String(value || "").trim()).filter(isIpv4Address))];
}

function probeIpv4Addresses(probe) {
  if (!probe) return [];
  return uniqueIpv4Addresses([
    probe.primaryAddress,
    probe.lastAddress,
    ...normalizeProbeAddresses(probe.addresses)
  ]);
}

function serverLanAddresses(server) {
  const ownerProbe = (state.probes || []).find((probe) => probe.id === server.probeId);
  return uniqueIpv4Addresses([server.hostname, ...probeIpv4Addresses(ownerProbe)]);
}

function sameProbeLan(probe, server) {
  const verifierAddresses = probeIpv4Addresses(probe);
  const targetAddresses = serverLanAddresses(server);
  return verifierAddresses.some((verifierAddress) =>
    targetAddresses.some((targetAddress) => sameIpv4Slash24(verifierAddress, targetAddress))
  );
}

function canProbeVerifyServer(verifierProbe, server) {
  return Boolean(
    verifierProbe &&
      server &&
      server.isActive &&
      !server.deletedAt &&
      server.checkSource === "probe" &&
      server.probeId &&
      server.probeId !== verifierProbe.id &&
      probeConnection(server).status === "stale" &&
      sameProbeLan(verifierProbe, server)
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

async function checkProbeStaleness(nowMs = Date.now()) {
  if (probeStalenessCheckRunning) return;
  probeStalenessCheckRunning = true;
  let changed = false;

  try {
    for (const server of state.servers) {
      if (server.deletedAt || !server.isActive || server.checkSource !== "probe") continue;
      const probe = (state.probes || []).find((item) => item.id === server.probeId);
      const lastSeenMs = newestTimestamp(probe?.lastSeenAt, server.lastProbeSeenAt);
      if (!lastSeenMs) continue;
      if (nowMs - lastSeenMs <= probeStaleAfterMs(server)) continue;

      const requested = Boolean(server.probeCheckRequestedAt);
      const nextFallbackCheckAt = Number(server.nextProbeFallbackCheckAt || 0);
      if (!requested && nextFallbackCheckAt && nowMs < nextFallbackCheckAt) continue;

      const checkedAt = nowIso();
      const previousStatus = server.currentStatus || "unknown";
      const lastSeenLabel = new Date(lastSeenMs).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });
      const baseMessage = `Probe collector sem contato desde ${lastSeenLabel}.`;
      const nextDelayMs = Math.max(10000, Math.max(3, Number(server.checkInterval || state.settings.defaultInterval || 10)) * 1000);
      server.nextProbeFallbackCheckAt = nowMs + nextDelayMs;
      if (server.probeEventStatus !== "stale") {
        server.probeEventStatus = "stale";
        addProbeEvent(server, "probe_stale", baseMessage);
      }

      const result = await pingHost(server.hostname);
      const localTarget = isLocalNetworkTarget(server.hostname);
      if (result.online) {
        const message = `${baseMessage} Servidor respondeu ao ping da central.`;
        server.lastCheckedAt = checkedAt;
        server.lastLatencyMs = result.latencyMs;
        server.lastError = message;
        server.probeCheckRequestedAt = null;
        server.consecutiveFailures = 0;
        server.currentStatus = "online";
        if (server.currentStatus !== previousStatus) {
          server.previousStatus = previousStatus;
          server.statusChangedAt = checkedAt;
          addEvent(server, previousStatus, server.currentStatus, result.latencyMs, message);
        } else {
          broadcast({ type: "server_checked", server: publicServer(server), summary: summary() });
        }
        changed = true;
        continue;
      }

      if (localTarget) {
        const message = `${baseMessage} Ping da central falhou: ${result.error || "sem resposta"}`;
        server.lastCheckedAt = checkedAt;
        server.lastLatencyMs = null;
        server.lastError = message;
        server.probeCheckRequestedAt = null;
        server.consecutiveFailures = (server.consecutiveFailures || 0) + 1;
        if (server.consecutiveFailures >= server.failureThreshold) {
          server.currentStatus = "offline";
        }

        if (server.currentStatus !== previousStatus) {
          server.previousStatus = previousStatus;
          server.statusChangedAt = checkedAt;
          addEvent(server, previousStatus, server.currentStatus, result.latencyMs, message);
        } else {
          broadcast({ type: "server_checked", server: publicServer(server), summary: summary() });
        }
        changed = true;
        continue;
      }

      const message = `${baseMessage} Ping da central tambem nao confirmou o status: ${result.error || "sem resposta"}. Aguardando retorno do probe ou confirmacao por outro probe da mesma rede.`;
      if (server.lastError !== message || requested) {
        server.lastError = message;
        server.lastCheckedAt = checkedAt;
        server.lastLatencyMs = null;
        server.probeCheckRequestedAt = null;
        broadcast({ type: "server_checked", server: publicServer(server), summary: summary() });
        changed = true;
      }
    }
  } finally {
    probeStalenessCheckRunning = false;
  }

  if (changed) scheduleSave();
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
    checkProbeStaleness(now).catch((error) => console.error("Falha ao verificar probes sem contato", error));
  }, CHECK_LOOP_MS);
}

function getProbeToken() {
  return String(process.env.SERVERWATCH_PROBE_TOKEN || state.settings.probeToken || "");
}

function authorizeProbe(req) {
  const header = String(req.headers.authorization || "");
  const token = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  const probeTokenHeader = String(req.headers["x-serverwatch-probe-token"] || "").trim();
  return (token && token === getProbeToken()) || (probeTokenHeader && probeTokenHeader === getProbeToken());
}

function compareVersions(left, right) {
  const normalize = (value) =>
    String(value || "")
      .split(/[^\d]+/)
      .filter(Boolean)
      .map((item) => Number(item));
  const leftParts = normalize(left);
  const rightParts = normalize(right);
  const length = Math.max(leftParts.length, rightParts.length);
  if (!leftParts.length && !rightParts.length) return 0;
  if (!leftParts.length) return -1;
  if (!rightParts.length) return 1;
  for (let index = 0; index < length; index += 1) {
    const leftPart = leftParts[index] || 0;
    const rightPart = rightParts[index] || 0;
    if (leftPart > rightPart) return 1;
    if (leftPart < rightPart) return -1;
  }
  return 0;
}

function probeVersionStatus(probe) {
  if (!probe.version) return "unknown";
  return compareVersions(probe.version, PROBE_COLLECTOR_VERSION) < 0 ? "outdated" : "current";
}

function publicProbe(probe) {
  const servers = listedServers().filter((server) => server.checkSource === "probe" && server.probeId === probe.id);
  const staleServers = servers.filter((server) => probeConnection(server).status === "stale").length;
  const versionStatus = probeVersionStatus(probe);
  return {
    id: probe.id,
    name: probe.name || probe.id,
    version: probe.version || null,
    latestVersion: PROBE_COLLECTOR_VERSION,
    versionStatus,
    updateAvailable: versionStatus === "outdated",
    hostName: probe.hostName || null,
    primaryAddress: probe.primaryAddress || null,
    addresses: Array.isArray(probe.addresses) ? probe.addresses : [],
    platform: probe.platform || null,
    primaryMac: probe.primaryMac || null,
    macAddresses: Array.isArray(probe.macAddresses) ? probe.macAddresses : [],
    hostMetrics: probe.hostMetrics || null,
    hostMetricsUpdatedAt: probe.hostMetricsUpdatedAt || null,
    lastSeenAt: probe.lastSeenAt || null,
    lastAddress: probe.lastAddress || null,
    deletedAt: probe.deletedAt || null,
    status: staleServers ? "stale" : probe.lastSeenAt ? "online" : "unknown",
    targetCount: servers.length,
    staleTargetCount: staleServers
  };
}

function publicSettings(currentUser = null) {
  return {
    brandName: state.settings.brandName || "ServerWatch",
    brandSubtitle: state.settings.brandSubtitle || "MVP LAN",
    logoDataUrl: state.settings.logoDataUrl || "",
    theme: state.settings.theme === "dark" ? "dark" : "light",
    probeStaleGraceSeconds: state.settings.probeStaleGraceSeconds || 45,
    defaultFailureThreshold: state.settings.defaultFailureThreshold || 2,
    soundAlertsEnabled: state.settings.soundAlertsEnabled !== false,
    browserNotificationsEnabled: state.settings.browserNotificationsEnabled !== false,
    alertSeverityByEnvironment: {
      production: state.settings.alertSeverityByEnvironment?.production || "critical",
      staging: state.settings.alertSeverityByEnvironment?.staging || "warning",
      development: state.settings.alertSeverityByEnvironment?.development || "info"
    },
    probeToken: currentUser?.role === "admin" ? getProbeToken() : "",
    probeTokenSource: process.env.SERVERWATCH_PROBE_TOKEN ? "environment" : "generated"
  };
}

function normalizeProbeAddresses(value) {
  if (Array.isArray(value)) {
    return value.map((address) => String(address).trim()).filter(Boolean);
  }
  if (!value) return [];
  try {
    const parsed = JSON.parse(String(value));
    if (Array.isArray(parsed)) return parsed.map((address) => String(address).trim()).filter(Boolean);
  } catch {
  }
  return String(value)
    .split(",")
    .map((address) => address.trim())
    .filter(Boolean);
}

function normalizeMacAddresses(value) {
  const normalize = (mac) =>
    String(mac || "")
      .trim()
      .toLowerCase()
      .replace(/-/g, ":");
  const valid = (mac) => /^[0-9a-f]{2}(:[0-9a-f]{2}){5}$/.test(mac) && mac !== "00:00:00:00:00:00";
  if (Array.isArray(value)) {
    return [...new Set(value.map(normalize).filter(valid))];
  }
  if (!value) return [];
  try {
    const parsed = JSON.parse(String(value));
    if (Array.isArray(parsed)) return [...new Set(parsed.map(normalize).filter(valid))];
  } catch {
  }
  return [...new Set(
    String(value)
      .split(",")
      .map(normalize)
      .filter(valid)
  )];
}

function normalizeProbePlatform(value, fallback = "") {
  const platform = String(value || fallback || "").trim().toLowerCase();
  if (platform === "win32" || platform === "windows") return "windows";
  if (platform === "darwin" || platform === "mac" || platform === "macos") return "macos";
  if (platform === "linux") return "linux";
  return platform || null;
}

function normalizeNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function normalizeHostMetrics(value, fallback = null) {
  let metrics = value;
  if (!metrics) return fallback || null;
  if (typeof metrics === "string") {
    try {
      metrics = JSON.parse(metrics);
    } catch {
      return fallback || null;
    }
  }
  if (!metrics || typeof metrics !== "object") return fallback || null;

  const disk = metrics.disk && typeof metrics.disk === "object"
    ? {
        mount: String(metrics.disk.mount || "").trim() || null,
        totalBytes: normalizeNumber(metrics.disk.totalBytes),
        usedBytes: normalizeNumber(metrics.disk.usedBytes),
        freeBytes: normalizeNumber(metrics.disk.freeBytes),
        usedPercent: normalizeNumber(metrics.disk.usedPercent)
      }
    : null;
  const networkInterfaces = Array.isArray(metrics.networkInterfaces)
    ? metrics.networkInterfaces
        .map((item) => ({
          name: String(item?.name || "").trim(),
          description: String(item?.description || "").trim() || null,
          status: String(item?.status || "").trim() || null,
          speedMbps: normalizeNumber(item?.speedMbps),
          mac: normalizeMacAddresses([item?.mac || ""])[0] || null,
          addresses: Array.isArray(item?.addresses)
            ? item.addresses
                .map((address) => ({
                  family: String(address?.family || "").trim() || null,
                  address: String(address?.address || "").trim(),
                  netmask: String(address?.netmask || "").trim() || null,
                  cidr: String(address?.cidr || "").trim() || null
                }))
                .filter((address) => address.address)
                .slice(0, 12)
            : []
        }))
        .filter((item) => item.name || item.addresses.length || item.mac)
        .slice(0, 24)
    : [];

  return {
    collectedAt: String(metrics.collectedAt || nowIso()),
    cpu: {
      usagePercent: normalizeNumber(metrics.cpu?.usagePercent),
      cores: normalizeNumber(metrics.cpu?.cores),
      model: String(metrics.cpu?.model || "").trim() || null,
      loadAverage: Array.isArray(metrics.cpu?.loadAverage)
        ? metrics.cpu.loadAverage.map(normalizeNumber).filter((item) => item !== null).slice(0, 3)
        : []
    },
    memory: {
      totalBytes: normalizeNumber(metrics.memory?.totalBytes),
      usedBytes: normalizeNumber(metrics.memory?.usedBytes),
      freeBytes: normalizeNumber(metrics.memory?.freeBytes),
      usedPercent: normalizeNumber(metrics.memory?.usedPercent)
    },
    disk,
    networkInterfaces,
    system: {
      uptimeSeconds: normalizeNumber(metrics.system?.uptimeSeconds),
      arch: String(metrics.system?.arch || "").trim() || null,
      release: String(metrics.system?.release || "").trim() || null,
      type: String(metrics.system?.type || "").trim() || null
    }
  };
}

function linkedServerForProbe(probeId) {
  return listedServers().find((server) => server.checkSource === "probe" && server.probeId === probeId) || null;
}

function recordProbeVersionChange(probeId, previousVersion, nextVersion) {
  if (!previousVersion || !nextVersion || previousVersion === nextVersion) return;
  if (compareVersions(nextVersion, previousVersion) <= 0) return;
  const server = linkedServerForProbe(probeId);
  if (!server) return;
  addProbeEvent(server, "probe_updated", `Probe atualizado de ${previousVersion} para ${nextVersion}.`);
}

function upsertProbe({ probeId, name, version, hostName, primaryAddress, addresses, platform, primaryMac, macAddresses, hostMetrics, remoteAddress }) {
  const id = String(probeId || "").trim();
  if (!id) return null;
  const existing = state.probes.find((probe) => probe.id === id);
  const normalizedAddresses = normalizeProbeAddresses(addresses);
  const normalizedMacAddresses = normalizeMacAddresses(macAddresses);
  const normalizedPrimaryMac = normalizeMacAddresses([primaryMac || normalizedMacAddresses[0] || existing?.primaryMac || ""])[0] || null;
  const normalizedPrimaryAddress = String(primaryAddress || normalizedAddresses[0] || existing?.primaryAddress || "").trim() || null;
  const normalizedHostMetrics = normalizeHostMetrics(hostMetrics, existing?.hostMetrics || null);
  const payload = {
    id,
    name: String(name || existing?.name || id).trim(),
    version: String(version || existing?.version || "").trim() || null,
    hostName: String(hostName || existing?.hostName || "").trim() || null,
    primaryAddress: normalizedPrimaryAddress,
    addresses: normalizedAddresses.length ? normalizedAddresses : Array.isArray(existing?.addresses) ? existing.addresses : [],
    platform: normalizeProbePlatform(platform, existing?.platform),
    primaryMac: normalizedPrimaryMac,
    macAddresses: normalizedMacAddresses.length ? normalizedMacAddresses : Array.isArray(existing?.macAddresses) ? existing.macAddresses : [],
    hostMetrics: normalizedHostMetrics,
    hostMetricsUpdatedAt: normalizedHostMetrics ? normalizedHostMetrics.collectedAt || nowIso() : existing?.hostMetricsUpdatedAt || null,
    lastSeenAt: nowIso(),
    lastAddress: remoteAddress || existing?.lastAddress || null,
    deletedAt: null
  };
  if (existing) {
    const previousVersion = existing.version || null;
    const changed =
      existing.name !== payload.name ||
      existing.version !== payload.version ||
      existing.hostName !== payload.hostName ||
      existing.primaryAddress !== payload.primaryAddress ||
      JSON.stringify(existing.addresses || []) !== JSON.stringify(payload.addresses || []) ||
      existing.platform !== payload.platform ||
      existing.primaryMac !== payload.primaryMac ||
      JSON.stringify(existing.macAddresses || []) !== JSON.stringify(payload.macAddresses || []) ||
      JSON.stringify(existing.hostMetrics || null) !== JSON.stringify(payload.hostMetrics || null) ||
      existing.hostMetricsUpdatedAt !== payload.hostMetricsUpdatedAt ||
      existing.lastAddress !== payload.lastAddress ||
      existing.deletedAt !== payload.deletedAt;
    Object.assign(existing, payload);
    recordProbeVersionChange(existing.id, previousVersion, existing.version || null);
    return { probe: existing, changed };
  }
  const probe = { createdAt: nowIso(), ...payload };
  state.probes.push(probe);
  return { probe, changed: true };
}

function ensureProbeServer(probe) {
  const hostname = String(probe.primaryAddress || probe.addresses?.[0] || "").trim();
  if (!hostname) return { server: null, changed: false };

  const serverName = String(probe.name || probe.hostName || probe.id).trim();
  const existing = state.servers.find(
    (server) => !server.deletedAt && server.checkSource === "probe" && server.probeId === probe.id
  );

  if (existing) {
    let changed = false;
    if (existing.autoCreatedByProbe && existing.hostname !== hostname) {
      existing.hostname = hostname;
      changed = true;
    }
    if (existing.autoCreatedByProbe && serverName && existing.name !== serverName) {
      existing.name = serverName;
      changed = true;
    }
    if (!existing.isActive) {
      existing.isActive = true;
      changed = true;
    }
    if (existing.platform !== probe.platform) {
      existing.platform = probe.platform || null;
      changed = true;
    }
    if (existing.primaryMac !== probe.primaryMac) {
      existing.primaryMac = probe.primaryMac || null;
      changed = true;
    }
    if (JSON.stringify(existing.macAddresses || []) !== JSON.stringify(probe.macAddresses || [])) {
      existing.macAddresses = Array.isArray(probe.macAddresses) ? probe.macAddresses : [];
      changed = true;
    }
    if (changed) existing.updatedAt = nowIso();
    return { server: existing, changed };
  }

  const createdAt = nowIso();
  const server = {
    id: randomUUID(),
    name: serverName || probe.id,
    hostname,
    description: "Cadastro criado automaticamente pelo Probe Collector.",
    checkMethod: "ping",
    checkSource: "probe",
    probeId: probe.id,
    checkInterval: state.settings.defaultInterval,
    failureThreshold: state.settings.defaultFailureThreshold,
    environment: "production",
    groupId: null,
    location: "",
    tags: ["probe"],
    isActive: true,
    nodeType: "server",
    infrastructurePlatform: "none",
    parentId: null,
    currentStatus: "unknown",
    previousStatus: "unknown",
    statusChangedAt: createdAt,
    lastCheckedAt: null,
    lastLatencyMs: null,
    lastError: null,
    lastProbeSeenAt: probe.lastSeenAt || createdAt,
    platform: probe.platform || null,
    primaryMac: probe.primaryMac || null,
    macAddresses: Array.isArray(probe.macAddresses) ? probe.macAddresses : [],
    consecutiveFailures: 0,
    createdAt,
    updatedAt: createdAt,
    autoCreatedByProbe: true
  };
  state.servers.unshift(server);
  return { server, changed: true };
}

function probeTargets(probeId) {
  const probe = (state.probes || []).find((item) => item.id === probeId);
  const toTarget = (server, verification = false) => ({
    id: server.id,
    name: server.name,
    hostname: server.hostname,
    checkMethod: "ping",
    checkInterval: server.checkInterval,
    failureThreshold: server.failureThreshold,
    verification,
    ownerProbeId: server.probeId,
    forceCheck: Boolean(
      server.probeCheckRequestedAt &&
        (!server.lastCheckedAt || new Date(server.probeCheckRequestedAt).getTime() > new Date(server.lastCheckedAt).getTime())
    )
  });
  const ownedTargets = listedServers()
    .filter((server) => server.isActive && server.checkSource === "probe" && server.probeId === probeId)
    .map((server) => toTarget(server, false));
  const verificationTargets = probe
    ? listedServers()
        .filter((server) => canProbeVerifyServer(probe, server))
        .map((server) => toTarget(server, true))
    : [];

  return [...ownedTargets, ...verificationTargets];
}

function applyProbeResult(server, result, probeId, options = {}) {
  const previousStatus = server.currentStatus || "unknown";
  const verification = Boolean(options.verification);
  const wasProbeStale = !verification && server.probeEventStatus === "stale";
  server.lastCheckedAt = result.checkedAt || nowIso();
  if (!verification) {
    server.lastProbeSeenAt = nowIso();
    server.probeEventStatus = "online";
  }
  server.probeCheckRequestedAt = null;
  server.lastLatencyMs = result.latencyMs ?? null;
  server.lastError = verification
    ? result.online
      ? `Probe local sem contato; servidor respondeu via probe ${probeId}.`
      : `Probe local sem contato; servidor nao respondeu via probe ${probeId}. ${result.error || "Sem resposta ao ping."}`
    : result.error || null;

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
    addEvent(
      server,
      previousStatus,
      server.currentStatus,
      server.lastLatencyMs,
      server.lastError || `Resultado recebido do probe ${probeId}.`
    );
  } else {
    broadcast({ type: "server_checked", server: publicServer(server), summary: summary() });
  }

  if (wasProbeStale) {
    addProbeEvent(server, "probe_recovered", `Probe ${probeId} voltou a se comunicar.`);
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

function parseCookies(req) {
  return String(req.headers.cookie || "")
    .split(";")
    .map((item) => item.trim())
    .filter(Boolean)
    .reduce((cookies, item) => {
      const index = item.indexOf("=");
      if (index > 0) cookies[item.slice(0, index)] = decodeURIComponent(item.slice(index + 1));
      return cookies;
    }, {});
}

function getSession(req) {
  const token = parseCookies(req)[SESSION_COOKIE];
  if (!token) return null;
  const session = sessions.get(token);
  if (!session || session.expiresAt <= Date.now()) {
    sessions.delete(token);
    return null;
  }
  const user = listedUsers().find((item) => item.id === session.userId && item.isActive !== false);
  if (!user) {
    sessions.delete(token);
    return null;
  }
  return { token, user };
}

function setSessionCookie(res, token) {
  res.setHeader("Set-Cookie", `${SESSION_COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${Math.floor(SESSION_TTL_MS / 1000)}`);
}

function clearSessionCookie(res) {
  res.setHeader("Set-Cookie", `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`);
}

function requireSession(req, res) {
  const session = getSession(req);
  if (!session) {
    sendJson(res, 401, { error: "Autenticacao necessaria." });
    return null;
  }
  return session;
}

function requireAdmin(req, res) {
  const session = requireSession(req, res);
  if (!session) return null;
  if (session.user.role !== "admin") {
    sendJson(res, 403, { error: "Apenas administradores podem executar esta acao." });
    return null;
  }
  return session;
}

function notFound(res) {
  sendJson(res, 404, { error: "Recurso nao encontrado." });
}

async function serveDownload(req, res) {
  const { pathname } = getRouteParts(req);
  const download = DOWNLOADS[pathname];
  if (!download) return notFound(res);
  const session = getSession(req);
  const hasAdminSession = session?.user?.role === "admin";
  const hasProbeToken = download.allowProbeToken && authorizeProbe(req);
  if (!download.public && !hasAdminSession && !hasProbeToken) {
    sendJson(res, session ? 403 : 401, { error: session ? "Apenas administradores podem baixar este arquivo." : "Autenticacao necessaria." });
    return;
  }

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

    if (parts[1] === "auth") {
      if (req.method === "GET" && parts[2] === "session") {
        const session = getSession(req);
        return sendJson(res, 200, {
          user: session ? publicUser(session.user) : null,
          settings: publicSettings(session?.user || null)
        });
      }

      if (req.method === "POST" && parts[2] === "login") {
        const payload = await readBody(req);
        const email = normalizeEmail(payload.email);
        const password = String(payload.password || "");
        const user = listedUsers().find((item) => item.email === email && item.isActive !== false);
        if (!user || !verifyPassword(password, user.passwordHash)) {
          return sendJson(res, 401, { error: "E-mail ou senha invalidos." });
        }
        const token = randomUUID();
        sessions.set(token, { userId: user.id, expiresAt: Date.now() + SESSION_TTL_MS });
        user.lastLoginAt = nowIso();
        user.updatedAt = user.updatedAt || user.lastLoginAt;
        scheduleSave();
        setSessionCookie(res, token);
        return sendJson(res, 200, { user: publicUser(user) });
      }

      if (req.method === "POST" && parts[2] === "logout") {
        const session = getSession(req);
        if (session) sessions.delete(session.token);
        clearSessionCookie(res);
        return sendJson(res, 200, { ok: true });
      }
    }

    if (parts[1] === "probe") {
      if (!authorizeProbe(req)) {
        return sendJson(res, 401, { error: "Token do probe invalido." });
      }

      if (req.method === "GET" && parts[2] === "validate") {
        return sendJson(res, 200, {
          ok: true,
          service: "serverwatch",
          latestVersion: PROBE_COLLECTOR_VERSION,
          timestamp: nowIso(),
          probeId: String(url.searchParams.get("probeId") || "").trim() || null
        });
      }

      if (req.method === "GET" && parts[2] === "targets") {
        const probeId = String(url.searchParams.get("probeId") || "").trim();
        const registered = upsertProbe({
          probeId,
          name: url.searchParams.get("name") || probeId,
          version: url.searchParams.get("version") || null,
          hostName: url.searchParams.get("hostName") || null,
          primaryAddress: url.searchParams.get("primaryAddress") || null,
          addresses: url.searchParams.get("addresses") || [],
          platform: url.searchParams.get("platform") || null,
          primaryMac: url.searchParams.get("primaryMac") || null,
          macAddresses: url.searchParams.get("macAddresses") || [],
          hostMetrics: url.searchParams.get("hostMetrics") || null,
          remoteAddress: req.socket.remoteAddress
        });
        if (!registered) return sendJson(res, 400, { error: "Informe probeId." });
        const ensuredServer = ensureProbeServer(registered.probe);
        scheduleSave();
        if (registered.changed || ensuredServer.changed) broadcastSnapshot();
        return sendJson(res, 200, {
          probe: publicProbe(registered.probe),
          targets: probeTargets(registered.probe.id)
        });
      }

      if (req.method === "POST" && parts[2] === "results") {
        const payload = await readBody(req);
        const registered = upsertProbe({
          probeId: payload.probeId,
          name: payload.name || payload.probeId,
          version: payload.version || null,
          hostName: payload.hostName || null,
          primaryAddress: payload.primaryAddress || null,
          addresses: payload.addresses || [],
          platform: payload.platform || null,
          primaryMac: payload.primaryMac || null,
          macAddresses: payload.macAddresses || [],
          hostMetrics: payload.hostMetrics || null,
          remoteAddress: req.socket.remoteAddress
        });
        if (!registered) return sendJson(res, 400, { error: "Informe probeId." });
        const probe = registered.probe;
        const ensuredServer = ensureProbeServer(probe);
        const results = Array.isArray(payload.results) ? payload.results : [];
        let accepted = 0;
        for (const result of results) {
          const server = state.servers.find(
            (item) =>
              item.id === result.serverId &&
              !item.deletedAt &&
              item.checkSource === "probe"
          );
          if (!server) continue;
          const ownsTarget = server.probeId === probe.id;
          const verifiesPeer = !ownsTarget && canProbeVerifyServer(probe, server);
          if (!ownsTarget && !verifiesPeer) continue;
          applyProbeResult(server, result, probe.id, { verification: verifiesPeer });
          accepted += 1;
        }
        scheduleSave();
        if (registered.changed || ensuredServer.changed || accepted > 0) broadcastSnapshot();
        return sendJson(res, 200, { ok: true, accepted });
      }
    }

    const session = requireSession(req, res);
    if (!session) return;

    if (req.method === "GET" && parts[1] === "summary") {
      return sendJson(res, 200, summary());
    }

    if (req.method === "GET" && parts[1] === "snapshot") {
      return sendJson(res, 200, snapshot(session.user));
    }

    if (parts[1] === "probes") {
      if (!requireAdmin(req, res)) return;
      if (req.method === "GET" && parts.length === 2) {
        return sendJson(res, 200, (state.probes || []).filter((probe) => !probe.deletedAt).map(publicProbe));
      }

      const id = parts[2];
      const probe = (state.probes || []).find((item) => item.id === id && !item.deletedAt);
      if (!probe) return notFound(res);

      if (req.method === "DELETE" && parts.length === 3) {
        const linkedServers = listedServers().filter((server) => server.checkSource === "probe" && server.probeId === probe.id);
        if (linkedServers.length) {
          return sendJson(res, 409, { error: "Reatribua ou remova os servidores vinculados antes de excluir este probe." });
        }
        probe.deletedAt = nowIso();
        probe.updatedAt = probe.deletedAt;
        scheduleSave();
        broadcastSnapshot();
        return sendJson(res, 200, publicProbe(probe));
      }
    }

    if (parts[1] === "settings") {
      if (req.method === "PUT" && parts[2] === "theme") {
        const payload = await readBody(req);
        state.settings = normalizeBranding(
          {
            brandName: state.settings.brandName,
            brandSubtitle: state.settings.brandSubtitle,
            logoDataUrl: state.settings.logoDataUrl,
            theme: payload.theme
          },
          state.settings
        );
        scheduleSave();
        broadcastSnapshot();
        return sendJson(res, 200, publicSettings(session.user));
      }

      if (req.method === "PUT" && parts[2] === "alerts") {
        const payload = await readBody(req);
        state.settings = normalizeAlertSettings(payload, state.settings);
        scheduleSave();
        broadcastSnapshot();
        return sendJson(res, 200, publicSettings(session.user));
      }

      if (!requireAdmin(req, res)) return;

      if (req.method === "PUT" && parts[2] === "branding") {
        const payload = await readBody(req);
        state.settings = normalizeBranding(payload, state.settings);
        scheduleSave();
        broadcastSnapshot();
        return sendJson(res, 200, publicSettings(session.user));
      }
    }

    if (parts[1] === "users") {
      if (!requireAdmin(req, res)) return;

      if (req.method === "GET" && parts.length === 2) {
        return sendJson(res, 200, listedUsers().map(publicUser));
      }

      if (req.method === "POST" && parts.length === 2) {
        const payload = await readBody(req);
        const createdAt = nowIso();
        const user = {
          id: randomUUID(),
          createdAt,
          lastLoginAt: null,
          ...normalizeUser(payload)
        };
        state.users.unshift(user);
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
    }

    if (parts[1] === "groups") {
      if (req.method === "GET" && parts.length === 2) {
        return sendJson(res, 200, listedGroups().map(publicGroup));
      }

      if (req.method !== "GET" && !requireAdmin(req, res)) return;

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
        broadcastSnapshot();
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
        broadcastSnapshot();
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
        broadcastSnapshot();
        return sendJson(res, 200, publicGroup(group));
      }
    }

    if (parts[1] === "servers") {
      if (req.method === "GET" && parts.length === 2) {
        return sendJson(res, 200, listedServers().map(publicServer));
      }

      if (req.method === "GET" && parts.length === 3) {
        const id = parts[2];
        const server = state.servers.find((item) => item.id === id && !item.deletedAt);
        if (!server) return notFound(res);
        return sendJson(res, 200, publicServer(server));
      }

      if (req.method === "GET" && parts[3] === "history") {
        const id = parts[2];
        const server = state.servers.find((item) => item.id === id && !item.deletedAt);
        if (!server) return notFound(res);
        const limit = Number(url.searchParams.get("limit") || 100);
        const events = state.events.filter((event) => event.serverId === id).slice(0, Math.min(limit, 500));
        return sendJson(res, 200, events);
      }

      if (!requireAdmin(req, res)) return;

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
        addAdministrativeEvent(server, "server_created", "Servidor cadastrado.", session.user.name);
        scheduleSave();
        broadcastSnapshot();
        return sendJson(res, 201, publicServer(server));
      }

      const id = parts[2];
      const server = state.servers.find((item) => item.id === id && !item.deletedAt);
      if (!server) return notFound(res);

      if (req.method === "PUT" && parts.length === 3) {
        const payload = await readBody(req);
        const manuallyRenamedAutoServer =
          server.autoCreatedByProbe &&
          (String(payload.name || "").trim() !== String(server.name || "").trim() ||
            String(payload.hostname || "").trim() !== String(server.hostname || "").trim());
        Object.assign(server, normalizeServer(payload, server));
        if (manuallyRenamedAutoServer) {
          server.autoCreatedByProbe = false;
        }
        addAdministrativeEvent(server, "server_edited", "Cadastro do servidor editado.", session.user.name);
        scheduleSave();
        broadcastSnapshot();
        return sendJson(res, 200, publicServer(server));
      }

      if (req.method === "DELETE" && parts.length === 3) {
        server.isActive = false;
        server.deletedAt = nowIso();
        server.updatedAt = nowIso();
        addAdministrativeEvent(server, "server_deleted", "Servidor removido do monitoramento.", session.user.name);
        scheduleSave();
        broadcastSnapshot();
        return sendJson(res, 200, publicServer(server));
      }

      if (req.method === "POST" && parts[3] === "toggle") {
        server.isActive = !server.isActive;
        server.updatedAt = nowIso();
        server.nextCheckAt = Date.now() + 300;
        addAdministrativeEvent(
          server,
          server.isActive ? "server_reactivated" : "server_paused",
          server.isActive ? "Monitoramento reativado." : "Monitoramento pausado.",
          session.user.name
        );
        scheduleSave();
        broadcastSnapshot();
        return sendJson(res, 200, publicServer(server));
      }

      if (req.method === "POST" && parts[3] === "check") {
        if (!server.isActive) {
          return sendJson(res, 409, { error: "Reative o servidor antes de solicitar uma checagem." });
        }
        addAdministrativeEvent(server, "manual_check_requested", "Checagem manual solicitada.", session.user.name);
        if (server.checkSource === "probe") {
          server.probeCheckRequestedAt = nowIso();
          scheduleSave();
          broadcast({ type: "server_checked", server: publicServer(server), summary: summary() });
          return sendJson(res, 202, { status: "probe_queued", server: publicServer(server) });
        }
        server.nextCheckAt = Date.now();
        await checkServer(server);
        return sendJson(res, 200, { status: "checked", server: publicServer(server) });
      }
    }

    if (req.method === "GET" && parts[1] === "alerts") {
      return sendJson(res, 200, state.alerts.slice(0, 100));
    }

    if (req.method === "DELETE" && parts[1] === "alerts" && parts.length === 2) {
      if (!requireAdmin(req, res)) return;
      state.alerts = [];
      scheduleSave();
      broadcastSnapshot();
      return sendJson(res, 200, { ok: true });
    }

    if (req.method === "POST" && parts[1] === "alerts" && parts[3] === "ack") {
      const alert = state.alerts.find((item) => item.id === parts[2]);
      if (!alert) return notFound(res);
      const payload = await readBody(req);
      alert.read = true;
      alert.acknowledgedAt = nowIso();
      alert.acknowledgedBy = session.user.name;
      alert.acknowledgmentNote = String(payload.note || "").trim().slice(0, 500);
      scheduleSave();
      broadcastSnapshot();
      return sendJson(res, 200, alert);
    }

    if (req.method === "POST" && parts[1] === "alerts" && parts[2] === "read") {
      const acknowledgedAt = nowIso();
      state.alerts = state.alerts.map((alert) => ({
        ...alert,
        read: true,
        acknowledgedAt: alert.acknowledgedAt || acknowledgedAt,
        acknowledgedBy: alert.acknowledgedBy || session.user.name
      }));
      scheduleSave();
      broadcastSnapshot();
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

function withInitialTheme(content) {
  const theme = state.settings.theme === "dark" ? "dark" : "light";
  return String(content).replace(
    '<html lang="pt-BR">',
    `<html lang="pt-BR" data-theme="${theme}" style="color-scheme: ${theme};">`
  );
}

async function serveStatic(req, res) {
  const { pathname } = getRouteParts(req);
  const safePath = pathname === "/" ? "/index.html" : pathname;
  const filePath = resolve(PUBLIC_DIR, `.${safePath}`);
  if (!filePath.startsWith(PUBLIC_DIR)) return notFound(res);

  try {
    const content = await readFile(filePath);
    const ext = extname(filePath);
    const body = ext === ".html" ? withInitialTheme(content) : content;
    res.writeHead(200, {
      "Content-Type": mimeTypes[ext] || "application/octet-stream",
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
  for (const client of sockets) {
    const socket = client.socket || client;
    if (!socket.destroyed) socket.write(frame);
  }
}

function broadcastSnapshot() {
  for (const client of sockets) {
    const socket = client.socket || client;
    if (!socket.destroyed) socket.write(encodeWebSocketFrame(snapshot(client.user || null)));
  }
}

function handleUpgrade(req, socket) {
  if (req.url !== "/ws") {
    socket.destroy();
    return;
  }
  const session = getSession(req);
  if (!session) {
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

  const client = { socket, user: session.user };
  sockets.add(client);
  socket.write(encodeWebSocketFrame(snapshot(session.user)));
  socket.on("close", () => sockets.delete(client));
  socket.on("error", () => sockets.delete(client));
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
