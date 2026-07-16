import { createServer } from "node:http";
import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import os from "node:os";
import { createAlertsHandler } from "./routes/alerts.js";
import { createBackupsHandler } from "./routes/backups.js";
import { createProxmoxBackupsHandler } from "./routes/proxmoxBackups.js";
import { createUnifiNetworkHandler } from "./routes/unifiNetwork.js";
import { createDownloadHandler } from "./routes/downloads.js";
import { createGroupsHandler } from "./routes/groups.js";
import { createHealthHandler } from "./routes/health.js";
import { createMetaHandler } from "./routes/meta.js";
import { createNetworkHandler } from "./routes/network.js";
import { createProbesHandler } from "./routes/probes.js";
import { createServerCheckHandler, createServerCreateHandler, createServerMutationHandler, createServerReadHandler } from "./routes/servers.js";
import { createSettingsHandler } from "./routes/settings.js";
import { createStaticHandler } from "./routes/static.js";
import { createUsersHandler } from "./routes/users.js";
import { createStorage } from "./storage/index.js";
import { createAlertService } from "./services/alert.js";
import { emptyCloudBackupState, fetchCloudBackupSummary } from "./services/cloudBackup.js";
import { emptyProxmoxBackupState, fetchProxmoxBackupSummary, proxmoxItemStatus, normalizeMatchKey } from "./services/proxmoxBackup.js";
import { emptyUnifiNetworkState, fetchUnifiNetworkSummary } from "./services/unifiNetwork.js";
import { pollDevice } from "./probe/snmp/poller.js";
import {
  clearSessionCookie,
  hashPassword,
  normalizeEmail,
  parseCookies,
  publicUser,
  setSessionCookie,
  verifyPassword
} from "./services/auth.js";
import { getRouteParts, notFound, readBody, sendJson } from "./services/http.js";
import { applyMonitorResult } from "./services/monitor.js";
import { createWebSocketHub } from "./ws/handler.js";

const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || "0.0.0.0";
const DATA_DIR = resolve(process.env.DATA_DIR || "data");
const DATA_FILE = join(DATA_DIR, "serverwatch.json");
const METRICS_HISTORY_FILE = join(DATA_DIR, "metrics-history.json");
const METRICS_SHORT_INTERVAL_MS = 60_000;
const METRICS_LONG_INTERVAL_MS = 60 * 60_000;
const METRICS_SHORT_TTL_MS = 72 * 60 * 60_000;
const METRICS_LONG_TTL_MS = 60 * 24 * 60 * 60_000;
// Historico de banda (bps) por link SNMP — mesma cadencia/retencao curta do
// historico "short" de CPU/memoria, so que sempre habilitado (sem tab long,
// nao ha pedido pra reter 60 dias de banda ainda).
const NETWORK_LINK_BPS_HISTORY_FILE = join(DATA_DIR, "network-link-bps-history.json");
const NETWORK_LINK_BPS_INTERVAL_MS = 60_000;
const NETWORK_LINK_BPS_TTL_MS = 72 * 60 * 60_000;
// Historico do teste ATIVO de velocidade (satura o link de proposito, roda
// de hora em hora por padrao) — retencao bem mais longa que o trafego
// passivo porque as amostras sao raras (poucas dezenas por dia).
const PROBE_SPEEDTEST_HISTORY_FILE = join(DATA_DIR, "probe-speedtest-history.json");
const PROBE_SPEEDTEST_TTL_MS = 30 * 24 * 60 * 60_000;
const STORAGE_TYPE = process.env.SERVERWATCH_STORAGE || (process.env.MONGODB_URI ? "mongodb" : "json");
const PUBLIC_DIR = resolve("public");
const DOWNLOADS = {
  "/downloads/probe/linux-installer": {
    path: resolve("tools/probe/install-linux.sh"),
    filename: "serverwatch-probe-install-linux.sh",
    contentType: "text/x-shellscript; charset=utf-8",
    public: true,
    allowProbeToken: true
  },
  "/downloads/probe/collector.js": {
    path: resolve("probe/collector.js"),
    filename: "collector.js",
    contentType: "text/javascript; charset=utf-8",
    public: true,
    allowProbeToken: true
  },
  "/downloads/probe/setup-server.js": {
    path: resolve("probe/setup-server.js"),
    filename: "setup-server.js",
    contentType: "text/javascript; charset=utf-8",
    allowProbeToken: true
  },
  "/downloads/probe/node-runtime-windows-x64": {
    path: resolve(process.env.SERVERWATCH_WINDOWS_NODE_RUNTIME_PATH || "downloads/node-v20.19.2-win-x64.zip"),
    filename: "serverwatch-node-runtime-win-x64.zip",
    contentType: "application/zip",
    allowProbeToken: true
  },
  "/downloads/probe/node-runtime-linux-x64": {
    path: resolve(process.env.SERVERWATCH_LINUX_X64_NODE_RUNTIME_PATH || "downloads/node-v20.19.2-linux-x64.tar.xz"),
    filename: "serverwatch-node-runtime-linux-x64.tar.xz",
    contentType: "application/x-xz",
    allowProbeToken: true
  },
  "/downloads/probe/node-runtime-linux-arm64": {
    path: resolve(process.env.SERVERWATCH_LINUX_ARM64_NODE_RUNTIME_PATH || "downloads/node-v20.19.2-linux-arm64.tar.xz"),
    filename: "serverwatch-node-runtime-linux-arm64.tar.xz",
    contentType: "application/x-xz",
    allowProbeToken: true
  },
  "/downloads/probe/windows-ps1-installer": {
    path: resolve("tools/probe/Install-Probe-Headless.ps1"),
    filename: "Install-Probe-Headless.ps1",
    contentType: "text/plain; charset=utf-8",
    public: true
  },
  "/downloads/probe/windows-installer": {
    path: resolve(process.env.SERVERWATCH_WINDOWS_INSTALLER_PATH || "downloads/ServerWatchProbeSetup.exe"),
    filename: "ServerWatchProbeSetup.exe",
    contentType: "application/vnd.microsoft.portable-executable",
    allowProbeToken: true
  },
  "/downloads/network-probe/windows-installer": {
    path: resolve(process.env.SERVERWATCH_WINDOWS_NETWORK_PROBE_INSTALLER_PATH || "downloads/ServerWatchNetworkProbeSetup.exe"),
    filename: "ServerWatchNetworkProbeSetup.exe",
    contentType: "application/vnd.microsoft.portable-executable",
    allowProbeToken: true
  },
  "/downloads/network-probe/linux-installer": {
    path: resolve("tools/probe/install-network-probe-linux.sh"),
    filename: "serverwatch-network-probe-install-linux.sh",
    contentType: "text/x-shellscript; charset=utf-8",
    public: true,
    allowProbeToken: true
  },
  "/downloads/network-probe/network-collector.js": {
    path: resolve("probe/network-collector.js"),
    filename: "network-collector.js",
    contentType: "text/javascript; charset=utf-8",
    public: true,
    allowProbeToken: true
  },
  "/downloads/network-probe/snmp-client.js": {
    path: resolve("probe/snmp/client.js"),
    filename: "client.js",
    contentType: "text/javascript; charset=utf-8",
    allowProbeToken: true
  },
  "/downloads/network-probe/vendor-templates.js": {
    path: resolve("probe/snmp/vendor-templates.js"),
    filename: "vendor-templates.js",
    contentType: "text/javascript; charset=utf-8",
    allowProbeToken: true
  },
  "/downloads/network-probe/poller.js": {
    path: resolve("probe/snmp/poller.js"),
    filename: "poller.js",
    contentType: "text/javascript; charset=utf-8",
    allowProbeToken: true
  },
  "/downloads/network-probe/windows-ps1-installer": {
    path: resolve("tools/probe/Install-NetworkProbeCollector-Headless.ps1"),
    filename: "Install-NetworkProbeCollector-Headless.ps1",
    contentType: "text/plain; charset=utf-8",
    public: true
  },
};
const CHECK_LOOP_MS = 1000;
const MAX_HISTORY_PER_SERVER = 500;
const CHECK_SOURCES = new Set(["serverwatch", "probe"]);
const NODE_TYPES = new Set(["server", "physical", "hypervisor", "vm", "service"]);
const INFRASTRUCTURE_PLATFORMS = new Set(["none", "proxmox", "vmware", "hyper-v", "bare-metal", "cloud", "linux", "windows", "other"]);
const NETWORK_DEVICE_VENDORS = new Set(["mikrotik", "pfsense", "fortigate", "generic", "other"]);
const NETWORK_LINK_TYPES = new Set(["internet", "mpls", "vpn", "radio", "fiber", "cellular", "other"]);
const NETWORK_LINK_STATUSES = new Set(["online", "degraded", "offline", "unknown"]);
const SESSION_COOKIE = "sw_session";
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const DEFAULT_ADMIN_EMAIL = process.env.SERVERWATCH_ADMIN_EMAIL || "admin@serverwatch.local";
const DEFAULT_ADMIN_PASSWORD = process.env.SERVERWATCH_ADMIN_PASSWORD || "admin123";
const PROBE_COLLECTOR_VERSION = "0.6.10";
// Versao esperada do collector do Network Probe (probe/network-collector.js)
// — namespace de versao totalmente separado do probe de host. Usar
// PROBE_COLLECTOR_VERSION pra comparar network probes fazia todo network
// probe aparecer "desatualizado" pra sempre (0.1.0 nunca alcanca 0.6.10).
const NETWORK_PROBE_COLLECTOR_VERSION = "0.2.0";

function expectedProbeVersion(probe) {
  return probe?.probeType === "network" ? NETWORK_PROBE_COLLECTOR_VERSION : PROBE_COLLECTOR_VERSION;
}
const CLOUDBACKUP_POLL_MS = 5 * 60 * 1000;
const PROXMOX_POLL_MS = 5 * 60 * 1000;
const UNIFI_POLL_MS = 5 * 60 * 1000;
// Coleta SNMP central — dispositivos com snmpEnabled=true e sem
// networkProbeId (nenhum Network Probe de LAN atribuido) sao coletados
// direto pelo proprio servidor, via tunel WireGuard ate a rede do cliente.
// Mesma cadencia do Network Probe (60s), timeout curto pra nao segurar o
// ciclo inteiro por causa de uma RB fora do ar.
const CENTRAL_SNMP_POLL_MS = 60 * 1000;
const CENTRAL_SNMP_TIMEOUT_MS = 5000;
// Janela de aviso de vencimento de contrato — checagem de hora em hora e
// sobra de folga pra uma janela de 10 dias (nao precisa de granularidade fina).
const CONTRACT_EXPIRY_NOTIFY_DAYS = 10;
const CONTRACT_EXPIRY_CHECK_MS = 60 * 60 * 1000;
const PROBE_UPDATE_SUPPORTED_PLATFORMS = new Set(["linux", "windows"]);

const sessions = new Map();
const metricsHistory = new Map();
let metricsHistorySaveTimer = null;
const networkLinkBpsHistory = new Map();
let networkLinkBpsHistorySaveTimer = null;
const probeSpeedTestHistory = new Map();
let probeSpeedTestHistorySaveTimer = null;
let state = {
  servers: [],
  groups: [],
  probes: [],
  networkDevices: [],
  networkLinks: [],
  networkEvents: [],
  users: [],
  events: [],
  alerts: [],
  probeUpdateRequests: [],
  sessions: [],
  cloudBackup: emptyCloudBackupState(),
  proxmoxBackup: emptyProxmoxBackupState(),
  unifiNetwork: emptyUnifiNetworkState(),
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
let unifiRefreshPromise = null;
let addEvent;
let addAdministrativeEvent;
let addProbeEvent;
const storage = createStorage({
  type: STORAGE_TYPE,
  dataFile: DATA_FILE,
  mongoUri: process.env.MONGODB_URI,
  mongoDb: process.env.MONGODB_DB || "serverwatch"
});

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

function normalizeChildIds(value) {
  if (Array.isArray(value)) {
    return [...new Set(value.map((item) => String(item || "").trim()).filter(Boolean))];
  }
  if (typeof value === "string") {
    return [...new Set(value.split(",").map((item) => item.trim()).filter(Boolean))];
  }
  return [];
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

  const interval = Number(payload.checkInterval ?? payload.check_interval ?? existing.checkInterval ?? 10);
  const threshold = Number(payload.failureThreshold ?? payload.failure_threshold ?? existing.failureThreshold ?? 3);
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

function normalizeNetworkVendor(value, fallback = "generic") {
  const vendor = String(value || fallback || "generic").trim().toLowerCase();
  return NETWORK_DEVICE_VENDORS.has(vendor) ? vendor : "generic";
}

function normalizeNetworkLinkType(value, fallback = "internet") {
  const type = String(value || fallback || "internet").trim().toLowerCase();
  return NETWORK_LINK_TYPES.has(type) ? type : "internet";
}

function normalizeOptionalHost(value, fieldName = "host") {
  const host = String(value || "").trim();
  if (!host) return "";
  if (!/^[a-zA-Z0-9._:-]+$/.test(host)) {
    const error = new Error(`${fieldName} invalido. Use apenas letras, numeros, ponto, hifen, underline ou dois-pontos.`);
    error.statusCode = 400;
    throw error;
  }
  return host;
}

function normalizeRouterosText(value, fieldName = "RouterOS") {
  const text = String(value || "").trim();
  if (!text) return "";
  if (text.length > 160 || /["\\{}\r\n]/.test(text)) {
    const error = new Error(`${fieldName} invalido para RouterOS.`);
    error.statusCode = 400;
    throw error;
  }
  return text;
}

function normalizeHostList(value, fallback = []) {
  const rawItems = Array.isArray(value)
    ? value
    : String(value || "")
        .split(/[\n,;]+/)
        .map((item) => item.trim());
  const fallbackItems = Array.isArray(fallback) ? fallback : [fallback];
  const items = rawItems.length ? rawItems : fallbackItems;
  return [...new Set(
    items
      .map((item) => normalizeOptionalHost(item, "Alvo do link"))
      .filter(Boolean)
  )];
}

function parseNetworkTargetLine(value) {
  const raw = String(value || "").trim();
  if (!raw) return null;
  const namedMatch = raw.match(/^(.+?)\s*(?:\||=>|=)\s*([a-zA-Z0-9._:-]+)$/);
  if (namedMatch) {
    return {
      name: namedMatch[1].trim(),
      host: normalizeOptionalHost(namedMatch[2], "Alvo do link")
    };
  }
  return {
    name: "",
    host: normalizeOptionalHost(raw, "Alvo do link")
  };
}

function normalizeNetworkTargets(value, fallback = []) {
  const rawItems = Array.isArray(value)
    ? value
    : String(value || "")
        .split(/[\n,;]+/)
        .map((item) => item.trim())
        .filter(Boolean);
  const fallbackItems = Array.isArray(fallback) ? fallback : [fallback];
  const items = rawItems.length ? rawItems : fallbackItems;
  const targets = [];
  const seen = new Set();

  for (const item of items) {
    const parsed = typeof item === "object" && item !== null
      ? {
          name: String(item.name || item.label || "").trim(),
          host: normalizeOptionalHost(item.host || item.targetHost || item.target_host, "Alvo do link"),
          gateway: normalizeRouterosText(item.gateway || item.expectedPublicIp || item.expected_public_ip || "", "Gateway do link"),
          prefixLength: normalizeNetworkPrefixLength(item.prefixLength ?? item.prefix_length ?? item.subnetPrefix ?? item.subnet_prefix)
        }
      : parseNetworkTargetLine(item);
    if (!parsed?.host || seen.has(parsed.host)) continue;
    seen.add(parsed.host);
    targets.push(parsed);
  }

  return targets;
}

function normalizeNetworkPrefixLength(value) {
  const raw = String(value ?? "").trim().replace(/^\//, "");
  if (!raw) return null;
  const prefixLength = Number(raw);
  if (!Number.isInteger(prefixLength) || prefixLength < 1 || prefixLength > 32) {
    const error = new Error("Mascara do alvo invalida. Use valores como /30, /29 ou /28.");
    error.statusCode = 400;
    throw error;
  }
  return prefixLength;
}

function normalizeNetworkDevice(payload, existing = {}) {
  const name = String(payload.name || existing.name || "").trim();
  if (!name) {
    const error = new Error("Informe o nome do dispositivo de rede.");
    error.statusCode = 400;
    throw error;
  }

  const rawGroupId = payload.groupId ?? payload.group_id ?? existing.groupId ?? null;
  const groupId = rawGroupId && rawGroupId !== "none" ? String(rawGroupId) : null;
  if (groupId && !listedGroups().some((group) => group.id === groupId)) {
    const error = new Error("Empresa/grupo informado nao existe.");
    error.statusCode = 400;
    throw error;
  }

  const rawProbeId = payload.probeId ?? payload.probe_id ?? existing.probeId ?? "";
  const probeId = String(rawProbeId || "").trim();
  if (probeId && !state.probes.some((probe) => probe.id === probeId && !probe.deletedAt)) {
    const error = new Error("Probe collector nao encontrado.");
    error.statusCode = 400;
    throw error;
  }

  const rawNetworkProbeId = payload.networkProbeId ?? payload.network_probe_id ?? existing.networkProbeId ?? "";
  const networkProbeId = String(rawNetworkProbeId || "").trim();
  if (
    networkProbeId &&
    !state.probes.some((probe) => probe.id === networkProbeId && !probe.deletedAt && (probe.probeType || "host") === "network")
  ) {
    const error = new Error("Network Probe informado nao encontrado.");
    error.statusCode = 400;
    throw error;
  }

  // snmpCommunity so eh atualizada quando enviada explicitamente (string nao-vazia) —
  // um payload de edicao sem esse campo preserva a community ja cadastrada.
  const rawSnmpCommunity = payload.snmpCommunity ?? payload.snmp_community;
  const snmpCommunity = rawSnmpCommunity !== undefined && rawSnmpCommunity !== null
    ? String(rawSnmpCommunity).trim()
    : String(existing.snmpCommunity || "");
  const snmpPort = Math.max(1, Math.min(65535, Number(payload.snmpPort ?? payload.snmp_port ?? existing.snmpPort ?? 161) || 161));

  return {
    name,
    vendor: normalizeNetworkVendor(payload.vendor, existing.vendor),
    model: String(payload.model || existing.model || "").trim(),
    managementIp: normalizeOptionalHost(payload.managementIp ?? payload.management_ip ?? existing.managementIp, "IP de gerenciamento"),
    groupId,
    probeId: probeId || null,
    networkProbeId: networkProbeId || null,
    snmpEnabled: Boolean(payload.snmpEnabled ?? payload.snmp_enabled ?? existing.snmpEnabled ?? false),
    snmpCommunity,
    snmpPort,
    vendorDetected: existing.vendorDetected === true,
    cpuPercent: existing.cpuPercent ?? null,
    memPercent: existing.memPercent ?? null,
    snmpStatus: existing.snmpStatus || "unconfigured",
    snmpLastCheckedAt: existing.snmpLastCheckedAt || null,
    environment: String(payload.environment || existing.environment || "production").trim() || "production",
    tags: normalizeTags(payload.tags ?? existing.tags ?? []),
    notes: String(payload.notes || existing.notes || "").trim(),
    isActive: payload.isActive ?? payload.is_active ?? existing.isActive ?? true
  };
}

function normalizeNetworkLink(payload, existing = {}) {
  const name = String(payload.name || existing.name || "").trim();
  if (!name) {
    const error = new Error("Informe o nome do link.");
    error.statusCode = 400;
    throw error;
  }

  const rawDeviceId = payload.networkDeviceId ?? payload.network_device_id ?? existing.networkDeviceId ?? null;
  const networkDeviceId = rawDeviceId && rawDeviceId !== "none" ? String(rawDeviceId) : null;
  const device = networkDeviceId
    ? (state.networkDevices || []).find((item) => item.id === networkDeviceId && !item.deletedAt)
    : null;
  if (networkDeviceId && !device) {
    const error = new Error("Dispositivo de rede informado nao existe.");
    error.statusCode = 400;
    throw error;
  }

  const rawGroupId = payload.groupId ?? payload.group_id ?? existing.groupId ?? device?.groupId ?? null;
  const groupId = rawGroupId && rawGroupId !== "none" ? String(rawGroupId) : null;
  if (groupId && !listedGroups().some((group) => group.id === groupId)) {
    const error = new Error("Empresa/grupo informado nao existe.");
    error.statusCode = 400;
    throw error;
  }

  // Links alimentados por SNMP (interface de um networkDevice) nao usam ping,
  // entao nao exigem probe/alvo de checagem — o status vem do poll SNMP do
  // Network Probe responsavel pelo dispositivo.
  const rawSnmpIfIndex = payload.snmpIfIndex ?? payload.snmp_if_index ?? existing.snmpIfIndex;
  const snmpIfIndexValue = Number(rawSnmpIfIndex);
  const isSnmpLink = Number.isFinite(snmpIfIndexValue) && snmpIfIndexValue >= 0;

  const probeId = String(payload.probeId ?? payload.probe_id ?? existing.probeId ?? device?.probeId ?? "").trim();
  if (!probeId && !isSnmpLink) {
    const error = new Error("Selecione um probe para monitorar este link.");
    error.statusCode = 400;
    throw error;
  }
  if (probeId && !state.probes.some((probe) => probe.id === probeId && !probe.deletedAt)) {
    const error = new Error("Probe collector nao encontrado.");
    error.statusCode = 400;
    throw error;
  }

  const fallbackTargets = existing.targets?.length
    ? existing.targets
    : (existing.targetHosts?.length ? existing.targetHosts : [existing.targetHost]);
  const targets = normalizeNetworkTargets(
    payload.targets ?? payload.targetTargets ?? payload.target_hosts ?? payload.targetHosts ?? payload.targetHost ?? payload.target_host,
    fallbackTargets
  );
  const targetHosts = targets.map((target) => target.host);
  if (!targetHosts.length && !isSnmpLink) {
    const error = new Error("Informe o alvo de monitoramento do link.");
    error.statusCode = 400;
    throw error;
  }
  const targetHost = targetHosts[0] || "";

  const interval = Number(payload.checkInterval ?? payload.check_interval ?? existing.checkInterval ?? state.settings.defaultInterval);
  const threshold = Number(payload.failureThreshold ?? payload.failure_threshold ?? existing.failureThreshold ?? state.settings.defaultFailureThreshold);
  const degradedLatencyMs = Number(payload.degradedLatencyMs ?? payload.degraded_latency_ms ?? existing.degradedLatencyMs ?? 120);
  const degradedPacketLossPercent = Number(
    payload.degradedPacketLossPercent ?? payload.degraded_packet_loss_percent ?? existing.degradedPacketLossPercent ?? 10
  );
  const degradedJitterMs = Number(payload.degradedJitterMs ?? payload.degraded_jitter_ms ?? existing.degradedJitterMs ?? 40);

  return {
    name,
    networkDeviceId,
    groupId,
    provider: String(payload.provider || existing.provider || "").trim(),
    linkType: normalizeNetworkLinkType(payload.linkType ?? payload.link_type, existing.linkType),
    interfaceName: String(payload.interfaceName ?? payload.interface_name ?? existing.interfaceName ?? "").trim(),
    targetHost,
    targetHosts,
    targets,
    expectedPublicIp: normalizeOptionalHost(payload.expectedPublicIp ?? payload.expected_public_ip ?? existing.expectedPublicIp, "IP publico esperado"),
    expectedPublicPrefixLength: normalizeNetworkPrefixLength(
      payload.expectedPublicPrefixLength ?? payload.expected_public_prefix_length ?? payload.expectedPrefixLength ?? payload.expected_prefix_length ?? existing.expectedPublicPrefixLength
    ),
    contractedDownloadMbps: Math.max(0, Number(payload.contractedDownloadMbps ?? payload.contracted_download_mbps ?? existing.contractedDownloadMbps ?? 0) || 0),
    contractedUploadMbps: Math.max(0, Number(payload.contractedUploadMbps ?? payload.contracted_upload_mbps ?? existing.contractedUploadMbps ?? 0) || 0),
    snmpIfIndex: (() => {
      const raw = payload.snmpIfIndex ?? payload.snmp_if_index ?? existing.snmpIfIndex;
      const value = Number(raw);
      return Number.isFinite(value) && value >= 0 ? value : null;
    })(),
    snmpIfDescr: String(payload.snmpIfDescr ?? payload.snmp_if_descr ?? existing.snmpIfDescr ?? "").trim(),
    probeId,
    checkInterval: Math.max(10, Math.min(3600, Number.isFinite(interval) ? interval : 10)),
    failureThreshold: Math.max(3, Math.min(10, Number.isFinite(threshold) ? threshold : 3)),
    degradedLatencyMs: Math.max(1, Math.min(10000, Number.isFinite(degradedLatencyMs) ? degradedLatencyMs : 120)),
    degradedPacketLossPercent: Math.max(0, Math.min(100, Number.isFinite(degradedPacketLossPercent) ? degradedPacketLossPercent : 10)),
    degradedJitterMs: Math.max(0, Math.min(10000, Number.isFinite(degradedJitterMs) ? degradedJitterMs : 40)),
    sampleCount: 1,
    isActive: payload.isActive ?? payload.is_active ?? existing.isActive ?? true,
    // Controla se o link aparece na lista principal ("Links por cliente") ou
    // fica colapsado sob o dispositivo — links criados manualmente (dialogo)
    // comecam destacados; links auto-criados pela descoberta SNMP (ver
    // /api/network-probe/results) comecam featured:false ate o admin marcar
    // no editor do dispositivo quais interfaces sao WAN de verdade.
    featured: Boolean(payload.featured ?? payload.is_featured ?? existing.featured ?? true),
    notes: String(payload.notes || existing.notes || "").trim()
  };
}

function syncVirtualizerChildren(parent, childIds = [], actorName = "Sistema") {
  if (!parent || parent.deletedAt || parent.nodeType !== "hypervisor") return 0;
  const selected = new Set(normalizeChildIds(childIds));
  let updated = 0;

  for (const server of listedServers()) {
    if (server.id === parent.id || server.nodeType === "hypervisor") continue;
    if (isDescendantServer(parent.id, server.id)) continue;

    const alreadyChild = server.parentId === parent.id;
    const canAttach = !server.parentId || alreadyChild;
    const shouldAttach = selected.has(server.id) && canAttach;
    const shouldDetach = !selected.has(server.id) && alreadyChild;
    if (!shouldAttach && !shouldDetach) continue;

    server.parentId = shouldAttach ? parent.id : null;
    server.nodeType = shouldAttach ? "vm" : normalizeNodeType(server.nodeType);
    if (shouldAttach && parent.groupId) {
      server.groupId = parent.groupId;
    }
    server.updatedAt = nowIso();
    addAdministrativeEvent(
      server,
      "server_edited",
      shouldAttach ? `Servidor vinculado como VM de ${parent.name}.` : `Servidor desvinculado de ${parent.name}.`,
      actorName
    );
    updated += 1;
  }

  return updated;
}

const SERVICE_CONTRACT_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// Contratos com vigencia (data de fim, opcionalmente data de inicio) —
// separado do array `contracts` (checkboxes de tipo de servico, sem data).
// Casa por id pra preservar `expiryAlertedAt` entre edicoes: so reseta o
// controle de alerta quando a data de fim realmente muda (renovacao/adiamento),
// senao checkContractExpirations() reenviaria o mesmo alerta a cada ciclo.
function normalizeGroupContracts(contractsPayload, existingContracts = []) {
  if (!Array.isArray(contractsPayload)) return Array.isArray(existingContracts) ? existingContracts : [];
  const existingById = new Map((existingContracts || []).map((entry) => [entry.id, entry]));
  return contractsPayload
    .map((entry) => {
      const endDate = String(entry?.endDate || "").trim();
      if (!SERVICE_CONTRACT_DATE_RE.test(endDate)) return null;
      const startDateRaw = String(entry?.startDate || "").trim();
      const id = String(entry?.id || "").trim() || randomUUID();
      const previous = existingById.get(id);
      return {
        id,
        label: String(entry?.label || "").trim().slice(0, 120) || "Contrato",
        startDate: SERVICE_CONTRACT_DATE_RE.test(startDateRaw) ? startDateRaw : null,
        endDate,
        expiryAlertedAt: previous && previous.endDate === endDate ? previous.expiryAlertedAt || null : null
      };
    })
    .filter(Boolean)
    .slice(0, 20);
}

function normalizeGroup(payload, existing = {}) {
  const name = String(payload.name || existing.name || "").trim();
  const logoDataUrl = String(payload.logoDataUrl ?? existing.logoDataUrl ?? "").trim();
  const allowedContracts = new Set(["support", "backup_msp", "backup_proxmox"]);
  const contractsSource = payload.contracts !== undefined ? payload.contracts : existing.contracts;
  const contracts = Array.isArray(contractsSource)
    ? [...new Set(contractsSource.map((contract) => String(contract || "").trim()).filter((contract) => allowedContracts.has(contract)))]
    : [];
  const serviceContracts = normalizeGroupContracts(
    payload.serviceContracts !== undefined ? payload.serviceContracts : existing.serviceContracts,
    existing.serviceContracts || []
  );
  if (!name) {
    const error = new Error("Informe o nome da empresa/grupo.");
    error.statusCode = 400;
    throw error;
  }
  if (
    logoDataUrl &&
    (!/^data:image\/(?:png|jpeg|jpg|webp|svg\+xml);base64,[a-z0-9+/=]+$/i.test(logoDataUrl) || logoDataUrl.length > 700000)
  ) {
    const error = new Error("Logo da empresa invalida. Use PNG, JPG, WEBP ou SVG com ate aproximadamente 500 KB.");
    error.statusCode = 400;
    throw error;
  }

  return {
    ...existing,
    name,
    description: String(payload.description ?? existing.description ?? "").trim(),
    contracts,
    serviceContracts,
    logoDataUrl,
    type: String(payload.type || existing.type || "company"),
    cloudBackupClientId:
      payload.cloudBackupClientId !== undefined
        ? String(payload.cloudBackupClientId || "").trim() || null
        : existing.cloudBackupClientId ?? null,
    unifiSiteId:
      payload.unifiSiteId !== undefined
        ? String(payload.unifiSiteId || "").trim() || null
        : existing.unifiSiteId ?? null,
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

function listedUsers() {
  return (state.users || []).filter((user) => !user.deletedAt);
}

function normalizeUserRole(role) {
  return role === "admin" ? "admin" : "user";
}

function isAdminUser(user) {
  return normalizeUserRole(user?.role) === "admin";
}

function userGroupIds(user) {
  if (isAdminUser(user)) return null;
  return new Set([
    ...(Array.isArray(user?.groupIds) ? user.groupIds : []),
    user?.groupId
  ].filter(Boolean).map(String));
}

function canAccessGroup(user, groupId) {
  if (!user || isAdminUser(user)) return true;
  if (!groupId) return false;
  return userGroupIds(user).has(String(groupId));
}

const ALL_SECTIONS = ["servers", "networks", "backups", "alerts", "history"];

function userAllowedSections(user) {
  if (!user || isAdminUser(user)) return new Set(ALL_SECTIONS);
  return new Set(Array.isArray(user.allowedSections) ? user.allowedSections.filter((section) => ALL_SECTIONS.includes(section)) : ALL_SECTIONS);
}

function canAccessSection(user, section) {
  return userAllowedSections(user).has(section);
}

function visibleGroups(user = null) {
  const groups = listedGroups();
  if (!user || isAdminUser(user)) return groups;
  const allowed = userGroupIds(user);
  return groups.filter((group) => allowed.has(group.id));
}

function scopedServers(user = null) {
  if (user && !canAccessSection(user, "servers")) return [];
  const servers = listedServers();
  if (!user || isAdminUser(user)) return servers;
  return servers.filter((server) => canAccessGroup(user, server.groupId));
}

function scopedNetworkDevices(user = null) {
  if (user && !canAccessSection(user, "networks")) return [];
  const devices = listedNetworkDevices();
  if (!user || isAdminUser(user)) return devices;
  return devices.filter((device) => canAccessGroup(user, device.groupId));
}

function scopedNetworkLinks(user = null) {
  if (user && !canAccessSection(user, "networks")) return [];
  const links = listedNetworkLinks();
  if (!user || isAdminUser(user)) return links;
  return links.filter((link) => canAccessGroup(user, link.groupId));
}

function decorateCloudBackupClients(clients) {
  return (clients || []).map((client) => {
    const group = listedGroups().find((item) => String(item.cloudBackupClientId || "") === String(client.id));
    return { ...client, groupId: group ? group.id : null, groupName: group ? group.name : null };
  });
}

function scopedCloudBackup(user = null) {
  if (user && !canAccessSection(user, "backups")) return emptyCloudBackupState();
  const backups = state.cloudBackup || emptyCloudBackupState();
  const decoratedClients = decorateCloudBackupClients(backups.clients);
  if (!user || isAdminUser(user)) {
    return { ...backups, clients: decoratedClients };
  }
  const allowedGroupIds = userGroupIds(user);
  const allowedClientIds = new Set(
    listedGroups()
      .filter((group) => allowedGroupIds.has(group.id) && group.cloudBackupClientId)
      .map((group) => String(group.cloudBackupClientId))
  );
  const clients = decoratedClients.filter((client) => allowedClientIds.has(String(client.id)));
  const status = clients.reduce(
    (acc, client) => {
      acc.info += client.status.info;
      acc.success += client.status.success;
      acc.warning += client.status.warning;
      acc.error += client.status.error;
      acc.nomon += client.status.nomon;
      acc.total += client.status.total;
      return acc;
    },
    { info: 0, success: 0, warning: 0, error: 0, nomon: 0, total: 0 }
  );
  return { ...backups, clients, status };
}

function setCloudBackupClientLink(clientId, groupId) {
  const id = String(clientId || "").trim();
  if (!id) {
    const error = new Error("Cliente de backup invalido.");
    error.statusCode = 400;
    throw error;
  }
  for (const group of state.groups) {
    if (String(group.cloudBackupClientId || "") === id) group.cloudBackupClientId = null;
  }
  if (groupId) {
    const group = state.groups.find((item) => item.id === groupId && !item.deletedAt);
    if (!group) {
      const error = new Error("Empresa nao encontrada.");
      error.statusCode = 404;
      throw error;
    }
    group.cloudBackupClientId = id;
  }
  scheduleSave();
  broadcastSnapshot();
}

function resolveProxmoxItemGroup(item) {
  const manual = listedGroups().find(
    (group) => group.proxmoxNamespace && normalizeMatchKey(group.proxmoxNamespace) === normalizeMatchKey(item.namespace)
  );
  if (manual) return manual;
  const key = normalizeMatchKey(item.namespace);
  if (!key) return null;
  const exact = listedGroups().find((group) => normalizeMatchKey(group.name) === key);
  if (exact) return exact;
  return (
    listedGroups().find((group) => {
      const groupKey = normalizeMatchKey(group.name);
      return groupKey && (groupKey.includes(key) || key.includes(groupKey));
    }) || null
  );
}

function resolveProxmoxItemServer(item, group) {
  const itemKey = `${item.namespace}:${item.backupId}`;
  const manual = listedServers().find((server) => server.proxmoxBackupKey === itemKey);
  if (manual) return manual;
  const key = normalizeMatchKey(item.comment);
  if (!key) return null;
  const candidates = group ? listedServers().filter((server) => server.groupId === group.id) : listedServers();
  return candidates.find((server) => normalizeMatchKey(server.name) === key || normalizeMatchKey(server.hostname) === key) || null;
}

function decorateProxmoxItems(items) {
  return (items || []).map((item) => {
    const group = resolveProxmoxItemGroup(item);
    const server = resolveProxmoxItemServer(item, group);
    return {
      ...item,
      groupId: group ? group.id : null,
      groupName: group ? group.name : null,
      serverId: server ? server.id : null,
      serverName: server ? server.name : null,
      status: proxmoxItemStatus(item)
    };
  });
}

function scopedProxmoxBackup(user = null) {
  if (user && !canAccessSection(user, "backups")) return emptyProxmoxBackupState();
  const backups = state.proxmoxBackup || emptyProxmoxBackupState();
  const decorated = decorateProxmoxItems(backups.items);
  if (!user || isAdminUser(user)) {
    return { ...backups, items: decorated };
  }
  const allowedGroupIds = userGroupIds(user);
  return { ...backups, items: decorated.filter((item) => item.groupId && allowedGroupIds.has(item.groupId)) };
}

function resolveUnifiSiteGroup(site) {
  const manual = listedGroups().find((group) => String(group.unifiSiteId || "") === String(site.id));
  if (manual) return manual;
  const keys = [site.name, site.internalReference].map(normalizeMatchKey).filter(Boolean);
  for (const key of keys) {
    const exact = listedGroups().find((group) => normalizeMatchKey(group.name) === key);
    if (exact) return exact;
  }
  return (
    listedGroups().find((group) => {
      const groupKey = normalizeMatchKey(group.name);
      return groupKey && keys.some((key) => groupKey.includes(key) || key.includes(groupKey));
    }) || null
  );
}

function decorateUnifiSites(sites) {
  return (sites || []).map((site) => {
    const group = resolveUnifiSiteGroup(site);
    return {
      ...site,
      groupId: group?.id || null,
      groupName: group?.name || null,
      devices: (site.devices || []).map((device) => ({
        ...device,
        groupId: group?.id || null,
        groupName: group?.name || null
      }))
    };
  });
}

function scopedUnifiNetwork(user = null) {
  if (user && !canAccessSection(user, "networks")) return emptyUnifiNetworkState();
  const unifi = state.unifiNetwork || emptyUnifiNetworkState();
  const sites = decorateUnifiSites(unifi.sites);
  if (!user || isAdminUser(user)) return { ...unifi, sites };
  const allowedGroupIds = userGroupIds(user);
  return { ...unifi, sites: sites.filter((site) => site.groupId && allowedGroupIds.has(site.groupId)) };
}

function linkUnifiSite(siteId, groupId) {
  const id = String(siteId || "").trim();
  if (!id) {
    const error = new Error("Site UniFi invalido.");
    error.statusCode = 400;
    throw error;
  }
  for (const group of state.groups) {
    if (String(group.unifiSiteId || "") === id) group.unifiSiteId = null;
  }
  if (groupId) {
    const group = state.groups.find((item) => item.id === groupId && !item.deletedAt);
    if (!group) {
      const error = new Error("Empresa nao encontrada.");
      error.statusCode = 404;
      throw error;
    }
    group.unifiSiteId = id;
  }
  scheduleSave();
  broadcastSnapshot();
}

function linkProxmoxNamespace(namespace, groupId) {
  const ns = String(namespace || "").trim();
  if (!ns) {
    const error = new Error("Namespace invalido.");
    error.statusCode = 400;
    throw error;
  }
  for (const group of state.groups) {
    if (group.proxmoxNamespace === ns) group.proxmoxNamespace = null;
  }
  if (groupId) {
    const group = state.groups.find((item) => item.id === groupId && !item.deletedAt);
    if (!group) {
      const error = new Error("Empresa nao encontrada.");
      error.statusCode = 404;
      throw error;
    }
    group.proxmoxNamespace = ns;
  }
  scheduleSave();
  broadcastSnapshot();
}

function linkProxmoxServer(namespace, backupId, serverId) {
  const ns = String(namespace || "").trim();
  const guestId = String(backupId || "").trim();
  if (!ns || !guestId) {
    const error = new Error("Namespace e backupId sao obrigatorios.");
    error.statusCode = 400;
    throw error;
  }
  const key = `${ns}:${guestId}`;
  for (const server of state.servers) {
    if (server.proxmoxBackupKey === key) server.proxmoxBackupKey = null;
  }
  if (serverId) {
    const server = state.servers.find((item) => item.id === serverId && !item.deletedAt);
    if (!server) {
      const error = new Error("Servidor nao encontrado.");
      error.statusCode = 404;
      throw error;
    }
    server.proxmoxBackupKey = key;
  }
  scheduleSave();
  broadcastSnapshot();
}

function canAccessServer(user, serverId) {
  if (!user || isAdminUser(user)) return true;
  const server = listedServers().find((item) => item.id === serverId);
  return server ? canAccessGroup(user, server.groupId) : false;
}

function canAccessNetworkLink(user, linkId) {
  if (!user || isAdminUser(user)) return true;
  const link = listedNetworkLinks().find((item) => item.id === linkId);
  return link ? canAccessGroup(user, link.groupId) : false;
}

function canAccessEvent(user, event) {
  if (!user || isAdminUser(user)) return true;
  if (event?.serverId) return canAccessServer(user, event.serverId);
  if (event?.linkId) return canAccessNetworkLink(user, event.linkId);
  if (event?.groupId) return canAccessGroup(user, event.groupId);
  return false;
}

function canAccessAlert(user, alert) {
  if (!user || isAdminUser(user)) return true;
  if (alert?.serverId) return canAccessServer(user, alert.serverId);
  if (alert?.groupId) return canAccessGroup(user, alert.groupId);
  return false;
}

function scopedEvents(user = null) {
  if (user && !canAccessSection(user, "history")) return [];
  const events = state.events || [];
  if (!user || isAdminUser(user)) return events;
  return events.filter((event) => canAccessEvent(user, event));
}

function scopedNetworkEvents(user = null) {
  if (user && !canAccessSection(user, "networks")) return [];
  const events = state.networkEvents || [];
  if (!user || isAdminUser(user)) return events;
  return events.filter((event) => canAccessEvent(user, event));
}

function scopedAlerts(user = null) {
  if (user && !canAccessSection(user, "alerts")) return [];
  const alerts = state.alerts || [];
  if (!user || isAdminUser(user)) return alerts;
  return alerts.filter((alert) => canAccessAlert(user, alert));
}

function eventTimestampMs(event) {
  const timestamp = new Date(event?.createdAt || event?.timestamp || 0).getTime();
  return Number.isFinite(timestamp) ? timestamp : 0;
}

function isServerFailureEvent(event) {
  return (event?.kind || "") === "server_offline" || event?.currentStatus === "offline" || event?.type === "down";
}

function isServerRecoveryEvent(event) {
  return (
    (event?.kind || "") === "server_recovered" ||
    (event?.currentStatus === "online" && event?.previousStatus === "offline") ||
    event?.type === "up" ||
    event?.type === "recovery"
  );
}

function serverEvents24hSummary(user = null) {
  const now = Date.now();
  const windowStart = now - 24 * 60 * 60 * 1000;
  const dayEvents = scopedEvents(user).filter((event) => eventTimestampMs(event) >= windowStart);
  const failures = dayEvents.filter(isServerFailureEvent);
  const recoveries = dayEvents.filter(isServerRecoveryEvent);
  const buckets = Array.from({ length: 12 }, (_, index) => {
    const start = now - (12 - index) * 2 * 60 * 60 * 1000;
    const end = start + 2 * 60 * 60 * 1000;
    return failures.filter((event) => {
      const timestamp = eventTimestampMs(event);
      return timestamp >= start && timestamp < end;
    }).length;
  });

  return {
    failures: failures.length,
    recoveries: recoveries.length,
    buckets
  };
}

function activeAdminCount() {
  return listedUsers().filter((user) => normalizeUserRole(user.role) === "admin" && user.isActive !== false).length;
}

function ensureDefaultAdmin() {
  state.users = Array.isArray(state.users) ? state.users : [];
  if (listedUsers().some((user) => normalizeUserRole(user.role) === "admin")) return false;
  const now = nowIso();
  state.users.push({
    id: randomUUID(),
    name: "Administrador",
    email: normalizeEmail(DEFAULT_ADMIN_EMAIL),
    role: "admin",
    groupIds: [],
    passwordHash: hashPassword(DEFAULT_ADMIN_PASSWORD),
    mustChangePassword: true,
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
  const role = normalizeUserRole(payload.role || existing.role || "user");
  const password = String(payload.password || "").trim();
  const requestedGroupIds = Array.isArray(payload.groupIds) ? payload.groupIds : Array.isArray(existing.groupIds) ? existing.groupIds : [];
  const groupIds = role === "admin"
    ? []
    : [...new Set(requestedGroupIds.map((id) => String(id || "").trim()).filter((id) => id && listedGroups().some((group) => group.id === id)))];
  const requestedSections = Array.isArray(payload.allowedSections) ? payload.allowedSections : existing.allowedSections;
  const allowedSections = role === "admin"
    ? ALL_SECTIONS
    : Array.isArray(requestedSections)
    ? [...new Set(requestedSections.filter((section) => ALL_SECTIONS.includes(section)))]
    : ALL_SECTIONS;

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
    groupIds,
    allowedSections,
    isActive: Boolean(payload.isActive ?? existing.isActive ?? true),
    passwordHash: password ? hashPassword(password) : existing.passwordHash,
    mustChangePassword: Boolean(payload.mustChangePassword ?? existing.mustChangePassword ?? false),
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
    networkDevices: [],
    networkLinks: [],
    networkEvents: [],
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
    networkDevices: Array.isArray(parsed.networkDevices) ? parsed.networkDevices : [],
    networkLinks: Array.isArray(parsed.networkLinks) ? parsed.networkLinks : [],
    networkEvents: Array.isArray(parsed.networkEvents) ? parsed.networkEvents : [],
    probeUpdateRequests: Array.isArray(parsed.probeUpdateRequests) ? parsed.probeUpdateRequests : [],
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
  state.users = state.users.map((user) => ({
    ...user,
    role: normalizeUserRole(user.role),
    groupIds: normalizeUserRole(user.role) === "admin"
      ? []
      : Array.isArray(user.groupIds)
      ? user.groupIds.map((id) => String(id)).filter(Boolean)
      : user.groupId
      ? [String(user.groupId)]
      : [],
    mustChangePassword: user.mustChangePassword === true
  }));
  state.networkDevices = (state.networkDevices || []).map((device) => ({
    ...device,
    vendor: normalizeNetworkVendor(device.vendor),
    groupId: device.groupId || null,
    probeId: device.probeId || null,
    isActive: device.isActive !== false
  }));
  state.networkLinks = (state.networkLinks || []).map((link) => {
    const targets = normalizeNetworkTargets(link.targets?.length ? link.targets : (link.targetHosts?.length ? link.targetHosts : [link.targetHost]));
    return {
      ...link,
      networkDeviceId: link.networkDeviceId || null,
      groupId: link.groupId || null,
      probeId: link.probeId || null,
      targetHost: targets[0]?.host || link.targetHost,
      targetHosts: targets.map((target) => target.host),
      targets,
      linkType: normalizeNetworkLinkType(link.linkType),
      currentStatus: NETWORK_LINK_STATUSES.has(link.currentStatus) ? link.currentStatus : "unknown",
      previousStatus: NETWORK_LINK_STATUSES.has(link.previousStatus) ? link.previousStatus : "unknown",
      consecutiveFailures: link.consecutiveFailures || 0,
      checkInterval: Math.max(10, Number(link.checkInterval || 10)),
      failureThreshold: Math.max(3, Number(link.failureThreshold || 3)),
      sampleCount: Math.max(1, Number(link.sampleCount || 1)),
      isActive: link.isActive !== false
    };
  });
  if (Array.isArray(parsed.sessions)) {
    for (const s of parsed.sessions) {
      if (s.token && s.expiresAt > now) {
        sessions.set(s.token, { userId: s.userId, expiresAt: s.expiresAt });
      }
    }
  }
  state.sessions = Array.isArray(parsed.sessions)
    ? parsed.sessions.filter((s) => s.expiresAt > now)
    : [];

  if (needsSave) await persistState();
}

async function persistState() {
  const payload = {
    ...state,
    servers: state.servers.map(({ nextCheckAt, nextProbeFallbackCheckAt, ...server }) => server),
    networkLinks: (state.networkLinks || []).map(({ nextCheckAt, ...link }) => link),
    sessions: Array.from(sessions.entries()).map(([token, s]) => ({ token, userId: s.userId, expiresAt: s.expiresAt }))
  };
  await storage.saveState(payload);
}

function scheduleSave() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    persistState().catch((error) => console.error("Falha ao salvar estado", error));
  }, 250);
}

function scheduleMetricsSave() {
  clearTimeout(metricsHistorySaveTimer);
  metricsHistorySaveTimer = setTimeout(() => {
    saveMetricsHistory().catch((error) => console.error("Falha ao salvar historico de metricas", error));
  }, 60_000);
}

async function saveMetricsHistory() {
  const payload = {};
  for (const [probeId, entry] of metricsHistory.entries()) {
    payload[probeId] = entry;
  }
  await mkdir(DATA_DIR, { recursive: true });
  const tempFile = `${METRICS_HISTORY_FILE}.${process.pid}.tmp`;
  await writeFile(tempFile, JSON.stringify(payload), "utf8");
  await rename(tempFile, METRICS_HISTORY_FILE);
}

async function loadMetricsHistory() {
  try {
    const raw = await readFile(METRICS_HISTORY_FILE, "utf8");
    const parsed = JSON.parse(raw);
    const now = Date.now();
    for (const [probeId, entry] of Object.entries(parsed)) {
      if (!entry || typeof entry !== "object") continue;
      metricsHistory.set(probeId, {
        lastShortAt: Number(entry.lastShortAt) || 0,
        lastLongAt: Number(entry.lastLongAt) || 0,
        short: Array.isArray(entry.short)
          ? entry.short.filter((s) => s.t >= now - METRICS_SHORT_TTL_MS)
          : [],
        long: Array.isArray(entry.long)
          ? entry.long.filter((s) => s.t >= now - METRICS_LONG_TTL_MS)
          : []
      });
    }
    console.log(`Historico de metricas carregado: ${metricsHistory.size} probe(s).`);
  } catch (error) {
    if (error.code !== "ENOENT") {
      console.error(`Falha ao carregar historico de metricas: ${error.message}`);
    }
  }
}

function scheduleNetworkLinkBpsSave() {
  clearTimeout(networkLinkBpsHistorySaveTimer);
  networkLinkBpsHistorySaveTimer = setTimeout(() => {
    saveNetworkLinkBpsHistory().catch((error) => console.error("Falha ao salvar historico de banda", error));
  }, 60_000);
}

async function saveNetworkLinkBpsHistory() {
  const payload = {};
  for (const [linkId, entry] of networkLinkBpsHistory.entries()) {
    payload[linkId] = entry;
  }
  await mkdir(DATA_DIR, { recursive: true });
  const tempFile = `${NETWORK_LINK_BPS_HISTORY_FILE}.${process.pid}.tmp`;
  await writeFile(tempFile, JSON.stringify(payload), "utf8");
  await rename(tempFile, NETWORK_LINK_BPS_HISTORY_FILE);
}

async function loadNetworkLinkBpsHistory() {
  try {
    const raw = await readFile(NETWORK_LINK_BPS_HISTORY_FILE, "utf8");
    const parsed = JSON.parse(raw);
    const now = Date.now();
    for (const [linkId, entry] of Object.entries(parsed)) {
      if (!entry || typeof entry !== "object") continue;
      networkLinkBpsHistory.set(linkId, {
        lastAt: Number(entry.lastAt) || 0,
        samples: Array.isArray(entry.samples) ? entry.samples.filter((s) => s.t >= now - NETWORK_LINK_BPS_TTL_MS) : []
      });
    }
    console.log(`Historico de banda carregado: ${networkLinkBpsHistory.size} link(s).`);
  } catch (error) {
    if (error.code !== "ENOENT") {
      console.error(`Falha ao carregar historico de banda: ${error.message}`);
    }
  }
}

// Amostra periodica de banda por link SNMP — mesma cadencia do historico
// "short" de CPU/memoria (1 amostra/min, retem 72h), usada pro grafico de
// variacao de velocidade na visao de empresa (ver renderNetworkCompanyDetail).
function recordNetworkLinkBps(linkId, inBps, outBps) {
  if (!linkId || (inBps == null && outBps == null)) return;
  const now = Date.now();
  let entry = networkLinkBpsHistory.get(linkId);
  if (!entry) {
    entry = { lastAt: 0, samples: [] };
    networkLinkBpsHistory.set(linkId, entry);
  }
  if (now - entry.lastAt < NETWORK_LINK_BPS_INTERVAL_MS) return;
  entry.samples.push({ t: now, inBps: inBps ?? null, outBps: outBps ?? null });
  const cut = now - NETWORK_LINK_BPS_TTL_MS;
  entry.samples = entry.samples.filter((s) => s.t >= cut);
  entry.lastAt = now;
  scheduleNetworkLinkBpsSave();
}

function scheduleProbeSpeedTestSave() {
  clearTimeout(probeSpeedTestHistorySaveTimer);
  probeSpeedTestHistorySaveTimer = setTimeout(() => {
    saveProbeSpeedTestHistory().catch((error) => console.error("Falha ao salvar historico de teste de velocidade", error));
  }, 60_000);
}

async function saveProbeSpeedTestHistory() {
  const payload = {};
  for (const [probeId, entry] of probeSpeedTestHistory.entries()) {
    payload[probeId] = entry;
  }
  await mkdir(DATA_DIR, { recursive: true });
  const tempFile = `${PROBE_SPEEDTEST_HISTORY_FILE}.${process.pid}.tmp`;
  await writeFile(tempFile, JSON.stringify(payload), "utf8");
  await rename(tempFile, PROBE_SPEEDTEST_HISTORY_FILE);
}

async function loadProbeSpeedTestHistory() {
  try {
    const raw = await readFile(PROBE_SPEEDTEST_HISTORY_FILE, "utf8");
    const parsed = JSON.parse(raw);
    const now = Date.now();
    for (const [probeId, entry] of Object.entries(parsed)) {
      if (!entry || typeof entry !== "object") continue;
      probeSpeedTestHistory.set(probeId, {
        samples: Array.isArray(entry.samples) ? entry.samples.filter((s) => s.t >= now - PROBE_SPEEDTEST_TTL_MS) : []
      });
    }
    console.log(`Historico de teste de velocidade carregado: ${probeSpeedTestHistory.size} probe(s).`);
  } catch (error) {
    if (error.code !== "ENOENT") {
      console.error(`Falha ao carregar historico de teste de velocidade: ${error.message}`);
    }
  }
}

function recordProbeSpeedTest(probeId, downloadMbps, uploadMbps, testedAt) {
  if (!probeId || downloadMbps == null) return;
  const t = testedAt ? new Date(testedAt).getTime() : Date.now();
  if (!Number.isFinite(t)) return;
  let entry = probeSpeedTestHistory.get(probeId);
  if (!entry) {
    entry = { samples: [] };
    probeSpeedTestHistory.set(probeId, entry);
  }
  entry.samples.push({ t, downloadMbps, uploadMbps: uploadMbps ?? null });
  const cut = Date.now() - PROBE_SPEEDTEST_TTL_MS;
  entry.samples = entry.samples.filter((s) => s.t >= cut);
  scheduleProbeSpeedTestSave();
}

function recordProbeMetrics(probeId, metrics) {
  if (!metrics || !probeId) return;
  const cpu = Number.isFinite(metrics.cpu?.usagePercent) ? Math.round(metrics.cpu.usagePercent) : null;
  const mem = Number.isFinite(metrics.memory?.usedPercent) ? Math.round(metrics.memory.usedPercent) : null;
  const diskPct = Number.isFinite(metrics.disk?.usedPercent) ? Math.round(metrics.disk.usedPercent) : null;
  const diskUsed = Number.isFinite(metrics.disk?.usedBytes) ? metrics.disk.usedBytes : null;
  const diskTotal = Number.isFinite(metrics.disk?.totalBytes) ? metrics.disk.totalBytes : null;
  if (cpu === null && mem === null && diskPct === null) return;

  const partitions = Array.isArray(metrics.diskPartitions)
    ? metrics.diskPartitions
        .filter((p) => Number.isFinite(p.usedPercent))
        .map((p) => ({
          m: String(p.mount || p.filesystem || "?").slice(0, 40),
          pct: Math.round(p.usedPercent),
          used: Number.isFinite(p.usedBytes) ? p.usedBytes : null,
          total: Number.isFinite(p.totalBytes) ? p.totalBytes : null
        }))
    : [];

  const now = Date.now();
  let entry = metricsHistory.get(probeId);
  if (!entry) {
    entry = { lastShortAt: 0, lastLongAt: 0, short: [], long: [] };
    metricsHistory.set(probeId, entry);
  }

  if (now - entry.lastShortAt >= METRICS_SHORT_INTERVAL_MS) {
    entry.short.push({ t: now, cpu, mem, diskPct, diskUsed, diskTotal, partitions });
    const cutShort = now - METRICS_SHORT_TTL_MS;
    entry.short = entry.short.filter((s) => s.t >= cutShort);
    entry.lastShortAt = now;
    scheduleMetricsSave();
  }

  if (now - entry.lastLongAt >= METRICS_LONG_INTERVAL_MS) {
    entry.long.push({ t: now, cpu, mem, diskPct, diskUsed, diskTotal, partitions });
    const cutLong = now - METRICS_LONG_TTL_MS;
    entry.long = entry.long.filter((s) => s.t >= cutLong);
    entry.lastLongAt = now;
    scheduleMetricsSave();
  }
}

let broadcastSnapshotTimer = null;

function scheduleBroadcastSnapshot() {
  if (broadcastSnapshotTimer) return;
  broadcastSnapshotTimer = setTimeout(() => {
    broadcastSnapshotTimer = null;
    broadcastSnapshot();
  }, 300);
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
    probeFallbackStatus: server.probeFallbackStatus || null,
    probeFallbackCheckedAt: server.probeFallbackCheckedAt || null,
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
  const networkDevices = listedNetworkDevices().filter((device) => device.groupId === group.id);
  const networkLinks = listedNetworkLinks().filter((link) => link.groupId === group.id);
  return {
    id: group.id,
    name: group.name,
    description: group.description,
    contracts: Array.isArray(group.contracts) ? group.contracts : [],
    serviceContracts: Array.isArray(group.serviceContracts) ? group.serviceContracts : [],
    type: group.type || "company",
    serverCount: servers.length,
    activeServerCount: activeServers.length,
    offlineCount: activeServers.filter((server) => server.currentStatus === "offline").length,
    networkDeviceCount: networkDevices.length,
    networkLinkCount: networkLinks.length,
    unifiSiteId: group.unifiSiteId || null,
    logoDataUrl: group.logoDataUrl || "",
    createdAt: group.createdAt,
    updatedAt: group.updatedAt,
    deletedAt: group.deletedAt || null
  };
}

function listedNetworkDevices() {
  return (state.networkDevices || []).filter((device) => !device.deletedAt);
}

function listedNetworkLinks() {
  return (state.networkLinks || []).filter((link) => !link.deletedAt);
}

function networkLinkStaleAfterMs(link) {
  const intervalMs = Math.max(5, Number(link.checkInterval || state.settings.defaultInterval || 10)) * 1000;
  const threshold = Math.max(1, Number(link.failureThreshold || state.settings.defaultFailureThreshold || 2));
  const graceMs = Math.max(15, Number(state.settings.probeStaleGraceSeconds || 45)) * 1000;
  return Math.max(graceMs, intervalMs * (threshold + 1) + 15000);
}

function networkProbeConnection(link) {
  const probe = (state.probes || []).find((item) => item.id === link.probeId && !item.deletedAt);
  const lastSeenMs = newestTimestamp(probe?.lastSeenAt, link.lastProbeSeenAt);
  const staleAfterMs = networkLinkStaleAfterMs(link);
  return {
    status: lastSeenMs && Date.now() - lastSeenMs > staleAfterMs ? "stale" : lastSeenMs ? "online" : "unknown",
    lastSeenAt: lastSeenMs ? new Date(lastSeenMs).toISOString() : null,
    staleAfterSeconds: Math.round(staleAfterMs / 1000)
  };
}

function publicNetworkDevice(device) {
  const group = device.groupId ? listedGroups().find((item) => item.id === device.groupId) : null;
  const links = listedNetworkLinks().filter((link) => link.networkDeviceId === device.id);
  return {
    id: device.id,
    name: device.name,
    vendor: device.vendor || "generic",
    model: device.model || "",
    managementIp: device.managementIp || "",
    groupId: device.groupId || null,
    groupName: group?.name || null,
    probeId: device.probeId || null,
    networkProbeId: device.networkProbeId || null,
    networkProbeName: device.networkProbeId
      ? (state.probes || []).find((probe) => probe.id === device.networkProbeId)?.name || device.networkProbeId
      : null,
    snmpEnabled: device.snmpEnabled === true,
    snmpCommunitySet: Boolean(device.snmpCommunity),
    snmpPort: device.snmpPort || 161,
    vendorDetected: device.vendorDetected === true,
    cpuPercent: device.cpuPercent ?? null,
    memPercent: device.memPercent ?? null,
    snmpStatus: device.snmpStatus || "unconfigured",
    snmpLastCheckedAt: device.snmpLastCheckedAt || null,
    discoveredInterfaces: Array.isArray(device.discoveredInterfaces) ? device.discoveredInterfaces : [],
    environment: device.environment || "production",
    tags: Array.isArray(device.tags) ? device.tags : [],
    notes: device.notes || "",
    isActive: device.isActive !== false,
    linkCount: links.length,
    offlineLinkCount: links.filter((link) => publicNetworkLink(link).displayStatus === "offline").length,
    degradedLinkCount: links.filter((link) => publicNetworkLink(link).displayStatus === "degraded").length,
    createdAt: device.createdAt,
    updatedAt: device.updatedAt,
    deletedAt: device.deletedAt || null
  };
}

function publicNetworkLink(link) {
  const group = link.groupId ? listedGroups().find((item) => item.id === link.groupId) : null;
  const device = link.networkDeviceId ? listedNetworkDevices().find((item) => item.id === link.networkDeviceId) : null;
  const probe = (state.probes || []).find((item) => item.id === link.probeId && !item.deletedAt);
  const probeConnection = networkProbeConnection(link);
  const canShowActiveWan = ["online", "degraded"].includes(link.currentStatus || "");
  const expectedActive = canShowActiveWan ? expectedWanDetection(link) : null;
  const displayStatus = link.isActive === false
    ? "paused"
    : probeConnection.status === "stale"
    ? "probe_unreachable"
    : link.currentStatus || "unknown";
  return {
    id: link.id,
    name: link.name,
    networkDeviceId: link.networkDeviceId || null,
    networkDeviceName: device?.name || null,
    vendor: device?.vendor || "generic",
    groupId: link.groupId || null,
    groupName: group?.name || null,
    provider: link.provider || "",
    linkType: link.linkType || "internet",
    interfaceName: link.interfaceName || "",
    targetHost: link.targetHost,
    targetHosts: Array.isArray(link.targetHosts) && link.targetHosts.length ? link.targetHosts : [link.targetHost].filter(Boolean),
    targets: Array.isArray(link.targets) && link.targets.length
      ? link.targets
      : (Array.isArray(link.targetHosts) && link.targetHosts.length ? link.targetHosts : [link.targetHost].filter(Boolean)).map((host) => ({ name: "", host })),
    activeTargetHost: expectedActive?.activeTargetHost || link.activeTargetHost || null,
    activeTargetName: expectedActive?.activeTargetName || link.activeTargetName || "",
    activeDetection: expectedActive?.activeDetection || link.activeDetection || "",
    observedPublicIp: link.observedPublicIp || null,
    expectedPublicIp: link.expectedPublicIp || "",
    expectedPublicPrefixLength: link.expectedPublicPrefixLength || null,
    contractedDownloadMbps: link.contractedDownloadMbps || 0,
    contractedUploadMbps: link.contractedUploadMbps || 0,
    snmpIfIndex: link.snmpIfIndex ?? null,
    snmpIfDescr: link.snmpIfDescr || "",
    featured: link.featured !== false,
    snmpInOctets: link.snmpLastInOctets ?? null,
    snmpOutOctets: link.snmpLastOutOctets ?? null,
    snmpInBps: link.snmpLastInBps ?? null,
    snmpOutBps: link.snmpLastOutBps ?? null,
    // true/false = tabela de rotas confirmou (ver applyNetworkDeviceSnmpResult);
    // undefined = sem sinal de rota ainda, frontend cai pro heuristico de trafego.
    snmpActiveRoute: link.snmpActiveRoute === true ? true : link.snmpActiveRoute === false ? false : undefined,
    monitorSource:
      link.monitorSource || (link.linkProbeAgentId ? "linkprobe" : link.snmpIfIndex != null ? "snmp" : "probe"),
    linkProbeAgentId: link.linkProbeAgentId || null,
    linkProbeVersion: link.linkProbeVersion || null,
    linkProbeSourceIp: link.linkProbeSourceIp || "",
    linkProbeSuccessRate: link.linkProbeSuccessRate ?? null,
    linkProbeIpChanged: link.linkProbeIpChanged === true,
    mikrotikAgentId: link.mikrotikAgentId || null,
    mikrotikVersion: link.mikrotikVersion || null,
    mikrotikRole: link.mikrotikRole || "",
    mikrotikRouteDistance: link.mikrotikRouteDistance || "",
    mikrotikInterfaceRunning: link.mikrotikInterfaceRunning ?? null,
    mikrotikHealthTarget: link.mikrotikHealthTarget || "",
    mikrotikHealthSent: link.mikrotikHealthSent ?? null,
    mikrotikHealthReceived: link.mikrotikHealthReceived ?? null,
    probeId: link.probeId || null,
    probeName: probe?.name || link.probeId || null,
    probeStatus: probeConnection.status,
    probeLastSeenAt: probeConnection.lastSeenAt,
    probeStaleAfterSeconds: probeConnection.staleAfterSeconds,
    checkInterval: link.checkInterval,
    failureThreshold: link.failureThreshold,
    degradedLatencyMs: link.degradedLatencyMs,
    degradedPacketLossPercent: link.degradedPacketLossPercent,
    degradedJitterMs: link.degradedJitterMs,
    currentStatus: link.currentStatus || "unknown",
    displayStatus,
    previousStatus: link.previousStatus || "unknown",
    statusChangedAt: link.statusChangedAt || link.createdAt,
    lastCheckedAt: link.lastCheckedAt || null,
    lastLatencyMs: link.lastLatencyMs ?? null,
    lastPacketLossPercent: link.lastPacketLossPercent ?? null,
    lastJitterMs: link.lastJitterMs ?? null,
    targetResults: Array.isArray(link.targetResults) ? link.targetResults : [],
    lastError: link.lastError || null,
    lastProbeSeenAt: link.lastProbeSeenAt || null,
    consecutiveFailures: link.consecutiveFailures || 0,
    forceCheckAt: link.forceCheckAt || null,
    isActive: link.isActive !== false,
    notes: link.notes || "",
    createdAt: link.createdAt,
    updatedAt: link.updatedAt,
    deletedAt: link.deletedAt || null
  };
}

function networkSummary(currentUser = null) {
  const links = scopedNetworkLinks(currentUser).filter((link) => link.isActive !== false && link.featured !== false);
  const publicLinks = links.map(publicNetworkLink);
  return {
    totalLinks: links.length,
    online: publicLinks.filter((link) => link.displayStatus === "online").length,
    degraded: publicLinks.filter((link) => link.displayStatus === "degraded").length,
    offline: publicLinks.filter((link) => link.displayStatus === "offline").length,
    probeUnreachable: publicLinks.filter((link) => link.displayStatus === "probe_unreachable").length,
    devices: scopedNetworkDevices(currentUser).filter((device) => device.isActive !== false).length,
    lastEventAt: scopedNetworkEvents(currentUser)?.[0]?.createdAt || null
  };
}

function addNetworkEvent(link, previousStatus, currentStatus, message) {
  const device = link.networkDeviceId ? listedNetworkDevices().find((item) => item.id === link.networkDeviceId) : null;
  const group = link.groupId ? listedGroups().find((item) => item.id === link.groupId) : null;
  const event = {
    id: randomUUID(),
    category: "network",
    kind: currentStatus === "offline" ? "network_link_offline" : currentStatus === "online" ? "network_link_recovered" : "network_link_degraded",
    linkId: link.id,
    linkName: link.name,
    deviceId: device?.id || null,
    deviceName: device?.name || null,
    groupId: group?.id || null,
    groupName: group?.name || null,
    previousStatus,
    currentStatus,
    latencyMs: link.lastLatencyMs ?? null,
    packetLossPercent: link.lastPacketLossPercent ?? null,
    jitterMs: link.lastJitterMs ?? null,
    message: message || null,
    createdAt: nowIso()
  };
  state.networkEvents.unshift(event);
  state.networkEvents = state.networkEvents.slice(0, 5000);
  broadcast({ type: "network_event_created", event, networkSummary: networkSummary() });
  return event;
}

function ipv4ToNumber(value) {
  const parts = String(value || "").trim().split(".");
  if (parts.length !== 4) return null;
  const octets = parts.map((part) => Number(part));
  if (octets.some((octet) => !Number.isInteger(octet) || octet < 0 || octet > 255)) return null;
  return octets.reduce((acc, octet) => ((acc << 8) | octet) >>> 0, 0);
}

function sameIpv4Subnet(left, right, prefixLength) {
  const leftNumber = ipv4ToNumber(left);
  const rightNumber = ipv4ToNumber(right);
  const prefix = Number(prefixLength);
  if (leftNumber === null || rightNumber === null || !Number.isInteger(prefix) || prefix < 1 || prefix > 32) return false;
  const mask = prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0;
  return (leftNumber & mask) === (rightNumber & mask);
}

function expectedWanDetection(link, observedPublicIp = link?.observedPublicIp) {
  const observed = String(observedPublicIp || "").trim();
  const expected = String(link?.expectedPublicIp || "").trim();
  const prefixLength = link?.expectedPublicPrefixLength ?? null;
  if (!observed || !expected) return null;
  if (observed === expected) {
    return {
      activeTargetHost: expected,
      activeTargetName: "Rede WAN",
      activeDetection: "expected_public_ip"
    };
  }
  if (prefixLength && sameIpv4Subnet(observed, expected, prefixLength)) {
    return {
      activeTargetHost: expected,
      activeTargetName: "Rede WAN",
      activeDetection: "expected_public_subnet"
    };
  }
  return null;
}

function reconcileNetworkLinkResult(link, result) {
  const targetResults = Array.isArray(result.targetResults) ? result.targetResults.slice(0, 20) : [];
  const targets = Array.isArray(link.targets) ? link.targets : [];
  const observedPublicIp = String(result.observedPublicIp || "").trim();
  const canMarkActive = result.online !== false;
  const expected = canMarkActive ? expectedWanDetection(link, observedPublicIp) : null;
  const enrichedResults = targetResults.map((target) => {
    const meta = targets.find((item) => item.host === target.targetHost || item.targetHost === target.targetHost) || {};
    const prefixLength = target.prefixLength ?? meta.prefixLength ?? meta.prefix_length ?? null;
    const egressActive = Boolean(canMarkActive && observedPublicIp && observedPublicIp === target.targetHost);
    const egressSubnetActive = Boolean(canMarkActive && !egressActive && observedPublicIp && prefixLength && sameIpv4Subnet(observedPublicIp, target.targetHost, prefixLength));
    return {
      ...target,
      targetName: target.targetName || meta.name || meta.label || "",
      prefixLength,
      egressActive,
      egressSubnetActive,
      egressSubnetPrefix: egressSubnetActive ? Number(prefixLength) : target.egressSubnetPrefix ?? null
    };
  });
  const exact = enrichedResults.find((target) => target.egressActive);
  const subnet = enrichedResults.find((target) => target.egressSubnetActive);
  const active = exact || subnet || null;
  return {
    ...result,
    targetResults: enrichedResults,
    activeTargetHost: expected?.activeTargetHost || active?.targetHost || result.activeTargetHost || null,
    activeTargetName: expected?.activeTargetName || active?.targetName || result.activeTargetName || "",
    activeDetection: expected?.activeDetection || (exact ? "egress_ip" : subnet ? "egress_subnet" : result.activeDetection || ""),
    jitterMs: enrichedResults.length > 1 ? null : result.jitterMs ?? null
  };
}

function networkCandidateStatus(link, result) {
  const packetLoss = Number(result.packetLossPercent ?? (result.online ? 0 : 100));
  const latency = Number(result.latencyMs ?? 0);
  const hasMultipleTargets = Array.isArray(result.targetResults) && result.targetResults.length > 1;
  const jitter = hasMultipleTargets ? 0 : Number(result.jitterMs ?? 0);
  if (!result.online || packetLoss >= 100) return "offline";
  if (
    packetLoss > Number(link.degradedPacketLossPercent || 10) ||
    latency > Number(link.degradedLatencyMs || 120) ||
    jitter > Number(link.degradedJitterMs || 40)
  ) {
    return "degraded";
  }
  return "online";
}

function applyNetworkLinkResult(link, result, probeId) {
  if (!link || link.deletedAt || link.probeId !== probeId) return false;
  if (link.monitorSource === "linkprobe" || link.linkProbeAgentId) return false;
  if (link.monitorSource === "snmp" || link.snmpIfIndex != null) return false;
  const adjustedResult = reconcileNetworkLinkResult(link, result);
  const checkedAt = result.checkedAt || nowIso();
  const previousStatus = link.currentStatus || "unknown";
  const candidate = networkCandidateStatus(link, adjustedResult);
  link.lastProbeSeenAt = nowIso();
  link.lastCheckedAt = checkedAt;
  link.lastLatencyMs = adjustedResult.latencyMs ?? null;
  link.lastPacketLossPercent = adjustedResult.packetLossPercent ?? (adjustedResult.online ? 0 : 100);
  link.lastJitterMs = adjustedResult.jitterMs ?? null;
  link.lastError = adjustedResult.error || null;
  link.activeTargetHost = adjustedResult.activeTargetHost || null;
  link.activeTargetName = adjustedResult.activeTargetName || "";
  link.activeDetection = adjustedResult.activeDetection || "";
  link.observedPublicIp = adjustedResult.observedPublicIp || null;
  link.targetResults = adjustedResult.targetResults;
  link.forceCheckAt = null;

  if (candidate === "offline") {
    link.consecutiveFailures = (link.consecutiveFailures || 0) + 1;
    if (link.consecutiveFailures >= Math.max(1, Number(link.failureThreshold || 1))) {
      link.currentStatus = "offline";
    }
  } else {
    link.consecutiveFailures = 0;
    link.currentStatus = candidate;
  }

  const changed = (link.currentStatus || "unknown") !== previousStatus;
  if (changed) {
    link.previousStatus = previousStatus;
    link.statusChangedAt = checkedAt;
    addNetworkEvent(
      link,
      previousStatus,
      link.currentStatus,
      link.lastError || `Resultado recebido do probe ${probeId}.`
    );
  }
  link.updatedAt = nowIso();
  return true;
}

// Aplica um resultado de coleta SNMP (status da interface + contadores de trafego)
// vindo do Network Probe. Espelha applyNetworkLinkResult, mas sem os campos
// especificos de ping (latencia/perda/jitter/deteccao de IP publico) — o status
// vem direto do ifOperStatus da interface (1 = up).
function applyNetworkLinkSnmpResult(link, result, networkProbeId) {
  if (!link || link.deletedAt) return false;
  if (link.snmpIfIndex == null) return false;
  const device = link.networkDeviceId ? listedNetworkDevices().find((item) => item.id === link.networkDeviceId) : null;
  if (!device || device.networkProbeId !== networkProbeId) return false;

  const checkedAt = result.checkedAt || nowIso();
  const previousStatus = link.currentStatus || "unknown";
  const online = Number(result.ifOperStatus) === 1;

  const inOctets = Number.isFinite(Number(result.inOctets)) ? Number(result.inOctets) : null;
  const outOctets = Number.isFinite(Number(result.outOctets)) ? Number(result.outOctets) : null;
  const sampleAt = new Date(checkedAt).getTime();
  const previousSampleAt = link.snmpLastSampleAt ? new Date(link.snmpLastSampleAt).getTime() : null;
  const elapsedSeconds = previousSampleAt && Number.isFinite(sampleAt) ? Math.max(1, (sampleAt - previousSampleAt) / 1000) : null;
  // Contadores de interface podem zerar (reboot do equipamento) — so calcula bps
  // quando o valor novo eh maior ou igual ao anterior, senao apenas reseta a base.
  const computeBps = (previous, current) =>
    previous != null && current != null && elapsedSeconds && current >= previous
      ? Math.round(((current - previous) * 8) / elapsedSeconds)
      : null;
  link.snmpLastInBps = computeBps(link.snmpLastInOctets, inOctets);
  link.snmpLastOutBps = computeBps(link.snmpLastOutOctets, outOctets);
  link.snmpLastInOctets = inOctets ?? link.snmpLastInOctets ?? null;
  link.snmpLastOutOctets = outOctets ?? link.snmpLastOutOctets ?? null;
  link.snmpLastSampleAt = checkedAt;
  recordNetworkLinkBps(link.id, link.snmpLastInBps, link.snmpLastOutBps);

  link.snmpIfDescr = result.ifDescr || link.snmpIfDescr || "";
  link.monitorSource = "snmp";
  link.lastProbeSeenAt = nowIso();
  link.lastCheckedAt = checkedAt;
  link.lastError = result.error || null;
  link.forceCheckAt = null;

  if (!online) {
    link.consecutiveFailures = (link.consecutiveFailures || 0) + 1;
    if (link.consecutiveFailures >= Math.max(1, Number(link.failureThreshold || 1))) {
      link.currentStatus = "offline";
    }
  } else {
    link.consecutiveFailures = 0;
    link.currentStatus = "online";
  }

  const changed = (link.currentStatus || "unknown") !== previousStatus;
  if (changed) {
    link.previousStatus = previousStatus;
    link.statusChangedAt = checkedAt;
    addNetworkEvent(
      link,
      previousStatus,
      link.currentStatus,
      link.lastError || `Resultado SNMP recebido do network probe ${networkProbeId}.`
    );
  }
  link.updatedAt = nowIso();
  return true;
}

// Aplica um resultado de coleta SNMP (CPU/RAM/interfaces) a um dispositivo —
// compartilhado entre o handler HTTP de resultados de Network Probe (LAN) e o
// coletor central via VPN (runCentralSnmpCycle), que chama isso diretamente
// em vez de ir por HTTP. networkProbeId eh repassado pra applyNetworkLinkSnmpResult
// checar a consistencia link->dispositivo->probe (ver funcao acima).
function applyNetworkDeviceSnmpResult(device, result, networkProbeId) {
  device.snmpStatus = String(result.snmpStatus || (result.error ? "unreachable" : "ok")).trim() || "unconfigured";
  device.cpuPercent = Number.isFinite(Number(result.cpuPercent)) ? Number(result.cpuPercent) : null;
  device.memPercent = Number.isFinite(Number(result.memPercent)) ? Number(result.memPercent) : null;
  device.snmpLastCheckedAt = nowIso();
  device.updatedAt = nowIso();
  if (result.detectedVendor && !device.vendorDetected) {
    device.vendor = normalizeNetworkVendor(result.detectedVendor, device.vendor);
    device.vendorDetected = true;
  }
  if (Array.isArray(result.discoveredInterfaces) && result.discoveredInterfaces.length) {
    device.discoveredInterfaces = result.discoveredInterfaces
      .slice(0, 200)
      .map((entry) => ({
        ifIndex: Number(entry?.ifIndex),
        ifDescr: String(entry?.ifDescr || "").trim().slice(0, 200)
      }))
      .filter((entry) => Number.isFinite(entry.ifIndex) && entry.ifIndex >= 0);

    // Cria automaticamente um link pra cada interface nova encontrada no walk
    // SNMP — comeca com featured:false (colapsado sob o dispositivo na UI)
    // ate o admin marcar no editor do dispositivo quais interfaces sao WAN de
    // verdade (ver checklist em openNetworkDeviceDialog/submitNetworkDevice
    // no app.js).
    const existingIfIndexes = new Set(
      listedNetworkLinks()
        .filter((link) => link.networkDeviceId === device.id && link.snmpIfIndex != null)
        .map((link) => link.snmpIfIndex)
    );
    for (const iface of device.discoveredInterfaces) {
      if (existingIfIndexes.has(iface.ifIndex)) continue;
      const createdAt = nowIso();
      try {
        const newLink = {
          id: randomUUID(),
          currentStatus: "unknown",
          previousStatus: "unknown",
          statusChangedAt: createdAt,
          lastCheckedAt: null,
          lastLatencyMs: null,
          lastPacketLossPercent: null,
          lastJitterMs: null,
          lastError: null,
          consecutiveFailures: 0,
          createdAt,
          updatedAt: createdAt,
          ...normalizeNetworkLink({
            name: iface.ifDescr || `Interface ${iface.ifIndex}`,
            networkDeviceId: device.id,
            snmpIfIndex: iface.ifIndex,
            snmpIfDescr: iface.ifDescr,
            featured: false
          })
        };
        state.networkLinks.unshift(newLink);
        existingIfIndexes.add(iface.ifIndex);
      } catch {
        // nome invalido ou outro erro de validacao — pula essa interface, nao derruba o resto
      }
    }
  }

  let acceptedInterfaces = 0;
  const interfaceResults = Array.isArray(result.interfaceResults) ? result.interfaceResults : [];
  for (const interfaceResult of interfaceResults) {
    const link = listedNetworkLinks().find((item) => item.id === interfaceResult.linkId);
    if (!link || link.networkDeviceId !== device.id) continue;
    if (applyNetworkLinkSnmpResult(link, interfaceResult, networkProbeId)) acceptedInterfaces += 1;
  }

  // Interface que a tabela de rotas do dispositivo diz que carrega a rota
  // padrao agora — sinal mais confiavel de "link ativo de verdade" do que
  // volume de trafego (ver pollActiveRouteIfIndex em probe/snmp/poller.js).
  // Se o agente nao expoe ipCidrRouteTable, activeRouteIfIndex vem null e os
  // links do dispositivo mantem snmpActiveRoute como esta (undefined), o que
  // faz o frontend cair pro heuristico de trafego.
  if (result.activeRouteIfIndex != null) {
    for (const link of listedNetworkLinks()) {
      if (link.networkDeviceId !== device.id) continue;
      const isActiveRoute = link.snmpIfIndex === result.activeRouteIfIndex;
      link.snmpActiveRoute = isActiveRoute;
      // A interface confirmada como rota ativa promove-se sozinha pra fora
      // da lista de "nao destacadas" — sem isso, quando a rota ativa cai
      // numa interface que o admin ainda nao tinha marcado como WAN, NENHUM
      // link visivel ficava com o selo ATIVO (o vencedor ficava escondido
      // atras do toggle de interfaces colapsadas). So promove, nunca despromove
      // (perder a rota ativa nao deveria esconder um link que o admin
      // decidiu manter visivel).
      if (isActiveRoute && link.featured === false) {
        link.featured = true;
        link.updatedAt = nowIso();
      }
    }
  }

  return acceptedInterfaces;
}

// Dispositivos com SNMP habilitado e sem Network Probe de LAN atribuido —
// alcancados direto pelo servidor (ex: via tunel WireGuard ate a VPN do
// cliente), sem precisar instalar um probe na rede.
function centrallyCollectedNetworkDevices() {
  return listedNetworkDevices().filter(
    (device) => device.snmpEnabled && !device.networkProbeId && device.managementIp && device.snmpCommunity
  );
}

async function runCentralSnmpCycle() {
  const devices = centrallyCollectedNetworkDevices();
  if (!devices.length) return;
  let touched = false;
  await Promise.all(
    devices.map(async (device) => {
      const interfaces = listedNetworkLinks()
        .filter((link) => link.networkDeviceId === device.id && link.snmpIfIndex != null)
        .map((link) => ({ linkId: link.id, snmpIfIndex: link.snmpIfIndex }));
      const target = {
        deviceId: device.id,
        managementIp: device.managementIp,
        snmpPort: device.snmpPort || 161,
        snmpCommunity: device.snmpCommunity,
        vendor: device.vendor || "generic",
        interfaces
      };
      try {
        const result = await pollDevice(target, CENTRAL_SNMP_TIMEOUT_MS);
        applyNetworkDeviceSnmpResult(device, result, device.networkProbeId);
      } catch (error) {
        applyNetworkDeviceSnmpResult(device, { snmpStatus: "unreachable", error: error.message }, device.networkProbeId);
      }
      touched = true;
    })
  );
  if (touched) {
    scheduleSave();
    scheduleBroadcastSnapshot();
  }
}

function daysUntilDate(dateStr) {
  const end = new Date(`${dateStr}T00:00:00`).getTime();
  if (!Number.isFinite(end)) return null;
  const today = new Date();
  const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
  return Math.round((end - todayStart) / 86400000);
}

function formatBrDate(dateStr) {
  const [year, month, day] = String(dateStr || "").split("-");
  return year && month && day ? `${day}/${month}/${year}` : String(dateStr || "");
}

// Varre os serviceContracts de todas as empresas e gera um alerta quando a
// data de fim entra na janela de aviso (10 dias). `expiryAlertedAt` no
// proprio contrato evita reenviar o mesmo alerta a cada ciclo; se a data foi
// adiada pra fora da janela, reseta o controle pra permitir um novo alerta
// caso ela volte a entrar na janela depois.
function checkContractExpirations() {
  let changed = false;
  for (const group of listedGroups()) {
    for (const contract of group.serviceContracts || []) {
      const daysLeft = daysUntilDate(contract.endDate);
      if (daysLeft === null) continue;
      if (daysLeft > CONTRACT_EXPIRY_NOTIFY_DAYS) {
        if (contract.expiryAlertedAt) {
          contract.expiryAlertedAt = null;
          changed = true;
        }
        continue;
      }
      if (contract.expiryAlertedAt) continue;
      const message =
        daysLeft < 0
          ? `${contract.label} de ${group.name} venceu ha ${Math.abs(daysLeft)} dia(s) (${formatBrDate(contract.endDate)}).`
          : daysLeft === 0
          ? `${contract.label} de ${group.name} vence hoje (${formatBrDate(contract.endDate)}).`
          : `${contract.label} de ${group.name} vence em ${daysLeft} dia(s) (${formatBrDate(contract.endDate)}).`;
      const createdAt = nowIso();
      const alert = {
        id: randomUUID(),
        groupId: group.id,
        groupName: group.name,
        type: "contract_expiring",
        severity: daysLeft < 0 ? "critical" : "warning",
        message,
        createdAt,
        read: false,
        acknowledgedAt: null,
        acknowledgedBy: null,
        acknowledgmentNote: ""
      };
      state.alerts.unshift(alert);
      state.alerts = state.alerts.slice(0, 200);
      contract.expiryAlertedAt = createdAt;
      changed = true;
      broadcast({ type: "alert", alert });
    }
  }
  if (changed) scheduleSave();
}

function summary(currentUser = null) {
  const servers = scopedServers(currentUser);
  const activeServers = servers.filter((server) => server.isActive);
  const total = activeServers.length;
  const online = activeServers.filter((server) => server.currentStatus === "online").length;
  const offline = activeServers.filter((server) => server.currentStatus === "offline").length;
  const unknown = activeServers.filter((server) => !server.currentStatus || server.currentStatus === "unknown").length;
  const last24h = Date.now() - 24 * 60 * 60 * 1000;
  const dayEvents = scopedEvents(currentUser).filter((event) => new Date(event.createdAt).getTime() >= last24h);
  const onlineEvents = dayEvents.filter((event) => event.currentStatus === "online").length;
  const availability24h = dayEvents.length ? Math.round((onlineEvents / dayEvents.length) * 1000) / 10 : total ? Math.round((online / total) * 1000) / 10 : 0;

  return {
    totalServers: total,
    online,
    offline,
    unknown,
    inactive: servers.length - total,
    availability24h,
    serverEvents24h: serverEvents24hSummary(currentUser),
    alertsOpen: scopedAlerts(currentUser).filter((alert) => !alert.read && alert.type === "down").length,
    network: networkSummary(currentUser),
    groups: visibleGroups(currentUser).length,
    lastEventAt: scopedEvents(currentUser)[0]?.createdAt || null
  };
}

function snapshot(currentUser = null) {
  const visibleServers = scopedServers(currentUser);
  const visibleNetworkDevices = scopedNetworkDevices(currentUser);
  const visibleNetworkLinks = scopedNetworkLinks(currentUser);
  return {
    type: "snapshot",
    summary: summary(currentUser),
    servers: visibleServers.map(publicServer),
    groups: visibleGroups(currentUser).map(publicGroup),
    networkDevices: visibleNetworkDevices.map(publicNetworkDevice),
    networkLinks: visibleNetworkLinks.map(publicNetworkLink),
    networkEvents: scopedNetworkEvents(currentUser).slice(0, 100),
    networkDiscoverySuggestions: isAdminUser(currentUser) ? networkDiscoverySuggestions() : [],
    probes: isAdminUser(currentUser) ? (state.probes || []).filter((probe) => !probe.deletedAt).map(publicProbe) : [],
    users: isAdminUser(currentUser) ? listedUsers().map(publicUser) : [],
    currentUser: currentUser ? publicUser(currentUser) : null,
    settings: publicSettings(currentUser),
    alerts: scopedAlerts(currentUser).slice(0, 50),
    events: scopedEvents(currentUser).slice(0, 100),
    cloudBackup: scopedCloudBackup(currentUser),
    proxmoxBackup: scopedProxmoxBackup(currentUser),
    unifiNetwork: scopedUnifiNetwork(currentUser)
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
  const result = await pingHost(server.hostname);
  const transition = applyMonitorResult(server, result, { checkedAt: nowIso() });

  if (transition.statusChanged) {
    server.previousStatus = transition.previousStatus;
    server.statusChangedAt = server.lastCheckedAt;
    addEvent(server, transition.previousStatus, server.currentStatus, result.latencyMs, result.error);
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
        server.probeFallbackStatus = "confirmed_online";
        server.probeFallbackCheckedAt = checkedAt;
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
        const wasOffline = previousStatus === "offline";
        const message = wasOffline
          ? `${baseMessage} Servidor permanece offline ate confirmacao de retorno. Ping da central nao confirmou retorno: ${result.error || "sem resposta"}.`
          : `${baseMessage} Ping da central nao confirmou o status: ${result.error || "sem resposta"}. Aguardando retorno do probe ou confirmacao por outro probe da mesma rede.`;
        server.lastCheckedAt = checkedAt;
        server.lastLatencyMs = null;
        server.lastError = message;
        server.probeCheckRequestedAt = null;
        server.probeFallbackStatus = wasOffline ? "confirmed_offline" : "central_failed";
        server.probeFallbackCheckedAt = checkedAt;
        server.consecutiveFailures = wasOffline ? Math.max(server.consecutiveFailures || 0, server.failureThreshold || 1) : 0;
        if (!wasOffline) server.currentStatus = "unknown";

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

      const wasOffline = previousStatus === "offline";
      const message = wasOffline
        ? `${baseMessage} Servidor permanece offline ate confirmacao de retorno. Ping da central tambem nao confirmou retorno: ${result.error || "sem resposta"}.`
        : `${baseMessage} Ping da central tambem nao confirmou o status: ${result.error || "sem resposta"}. Aguardando retorno do probe ou confirmacao por outro probe da mesma rede.`;
      if (server.lastError !== message || requested) {
        server.lastError = message;
        server.lastCheckedAt = checkedAt;
        server.lastLatencyMs = null;
        server.probeCheckRequestedAt = null;
        server.probeFallbackStatus = wasOffline ? "confirmed_offline" : "unconfirmed";
        server.probeFallbackCheckedAt = checkedAt;
        server.consecutiveFailures = wasOffline ? Math.max(server.consecutiveFailures || 0, server.failureThreshold || 1) : 0;
        if (!wasOffline) server.currentStatus = "unknown";
        if (server.currentStatus !== previousStatus) {
          server.previousStatus = previousStatus;
          server.statusChangedAt = checkedAt;
          addEvent(server, previousStatus, server.currentStatus, result.latencyMs, message);
        } else {
          broadcast({ type: "server_checked", server: publicServer(server), summary: summary() });
        }
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

function getCloudBackupApiKey() {
  return String(process.env.CLOUDBACKUP_API_KEY || state.settings.cloudBackupApiKey || "").trim();
}

function normalizeCloudBackupSettings(payload, existing = {}) {
  const apiKey = payload.apiKey !== undefined ? String(payload.apiKey || "").trim() || null : existing.cloudBackupApiKey ?? null;
  return { ...existing, cloudBackupApiKey: apiKey };
}

async function refreshCloudBackup() {
  const apiKey = getCloudBackupApiKey();
  if (!apiKey) {
    state.cloudBackup = emptyCloudBackupState();
    return;
  }
  try {
    state.cloudBackup = await fetchCloudBackupSummary(apiKey);
  } catch (error) {
    state.cloudBackup = {
      ...(state.cloudBackup || emptyCloudBackupState()),
      configured: true,
      error: error.message || "Falha ao consultar a API de backups."
    };
    throw error;
  } finally {
    scheduleSave();
    scheduleBroadcastSnapshot();
  }
}

function getProxmoxConfig() {
  const baseUrl = String(process.env.PROXMOX_PBS_BASE_URL || state.settings.proxmoxPbsBaseUrl || "").trim().replace(/\/+$/, "");
  const tokenId = String(process.env.PROXMOX_PBS_TOKEN_ID || state.settings.proxmoxPbsTokenId || "").trim();
  const tokenSecret = String(process.env.PROXMOX_PBS_TOKEN_SECRET || state.settings.proxmoxPbsTokenSecret || "").trim();
  const tlsFingerprint = String(process.env.PROXMOX_PBS_TLS_FINGERPRINT || state.settings.proxmoxPbsTlsFingerprint || "").trim();
  if (!baseUrl || !tokenId || !tokenSecret) return null;
  return { baseUrl, tokenId, tokenSecret, tlsFingerprint };
}

function normalizeProxmoxSettings(payload, existing = {}) {
  const baseUrl =
    payload.baseUrl !== undefined ? String(payload.baseUrl || "").trim().replace(/\/+$/, "") || null : existing.proxmoxPbsBaseUrl ?? null;
  const tokenId = payload.tokenId !== undefined ? String(payload.tokenId || "").trim() || null : existing.proxmoxPbsTokenId ?? null;
  const tokenSecret =
    payload.tokenSecret !== undefined ? String(payload.tokenSecret || "").trim() || null : existing.proxmoxPbsTokenSecret ?? null;
  const tlsFingerprint =
    payload.tlsFingerprint !== undefined
      ? String(payload.tlsFingerprint || "").trim() || null
      : existing.proxmoxPbsTlsFingerprint ?? null;
  return {
    ...existing,
    proxmoxPbsBaseUrl: baseUrl,
    proxmoxPbsTokenId: tokenId,
    proxmoxPbsTokenSecret: tokenSecret,
    proxmoxPbsTlsFingerprint: tlsFingerprint
  };
}

const PROXMOX_DATASTORE_HISTORY_DAYS = 180;

function proxmoxHistoryDay(value = new Date()) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return new Date().toISOString().slice(0, 10);
  return date.toISOString().slice(0, 10);
}

function normalizeProxmoxDatastoreHistory(history = []) {
  if (!Array.isArray(history)) return [];
  return history
    .map((entry) => ({
      datastore: String(entry.datastore || "").trim(),
      day: String(entry.day || "").trim(),
      sampledAt: entry.sampledAt || null,
      usedBytes: Number(entry.usedBytes) || 0,
      totalBytes: Number(entry.totalBytes) || 0,
      availBytes: Number(entry.availBytes) || 0
    }))
    .filter((entry) => entry.datastore && /^\d{4}-\d{2}-\d{2}$/.test(entry.day));
}

function withProxmoxDatastoreHistory(previousState = {}, nextState = {}) {
  const now = new Date();
  const today = proxmoxHistoryDay(now);
  const cutoff = new Date(now);
  cutoff.setUTCDate(cutoff.getUTCDate() - PROXMOX_DATASTORE_HISTORY_DAYS);
  const cutoffDay = proxmoxHistoryDay(cutoff);
  const entries = normalizeProxmoxDatastoreHistory(previousState.datastoreHistory);
  const byKey = new Map(entries.map((entry) => [`${entry.datastore}::${entry.day}`, entry]));

  for (const datastore of nextState.datastores || []) {
    const name = String(datastore.datastore || "").trim();
    if (!name) continue;
    byKey.set(`${name}::${today}`, {
      datastore: name,
      day: today,
      sampledAt: now.toISOString(),
      usedBytes: Number(datastore.usedBytes) || 0,
      totalBytes: Number(datastore.totalBytes) || 0,
      availBytes: Number(datastore.availBytes) || 0
    });
  }

  const datastoreHistory = [...byKey.values()]
    .filter((entry) => entry.day >= cutoffDay)
    .sort((left, right) => left.datastore.localeCompare(right.datastore) || left.day.localeCompare(right.day));

  return {
    ...nextState,
    datastoreHistory
  };
}

function getUnifiConfig() {
  const baseUrl = String(process.env.UNIFI_BASE_URL || state.settings.unifiBaseUrl || "").trim().replace(/\/+$/, "");
  const apiKey = String(process.env.UNIFI_API_KEY || state.settings.unifiApiKey || "").trim();
  const tlsFingerprint = String(process.env.UNIFI_TLS_FINGERPRINT || state.settings.unifiTlsFingerprint || "").trim();
  const apiBasePath = String(
    process.env.UNIFI_API_BASE_PATH || state.settings.unifiApiBasePath || "/proxy/network/integration"
  ).trim().replace(/\/+$/, "");
  if (!baseUrl || !apiKey) return null;
  return { baseUrl, apiKey, tlsFingerprint, apiBasePath };
}

function normalizeUnifiSettings(payload, existing = {}) {
  const baseUrl =
    payload.baseUrl !== undefined ? String(payload.baseUrl || "").trim().replace(/\/+$/, "") || null : existing.unifiBaseUrl ?? null;
  const apiKey = payload.apiKey !== undefined ? String(payload.apiKey || "").trim() || null : existing.unifiApiKey ?? null;
  const tlsFingerprint =
    payload.tlsFingerprint !== undefined
      ? String(payload.tlsFingerprint || "").trim() || null
      : existing.unifiTlsFingerprint ?? null;
  const apiBasePath =
    payload.apiBasePath !== undefined
      ? String(payload.apiBasePath || "").trim().replace(/\/+$/, "") || "/proxy/network/integration"
      : existing.unifiApiBasePath || "/proxy/network/integration";
  return {
    ...existing,
    unifiBaseUrl: baseUrl,
    unifiApiKey: apiKey,
    unifiTlsFingerprint: tlsFingerprint,
    unifiApiBasePath: apiBasePath
  };
}

async function refreshUnifiNetwork() {
  if (unifiRefreshPromise) return unifiRefreshPromise;
  const config = getUnifiConfig();
  if (!config) {
    state.unifiNetwork = emptyUnifiNetworkState();
    return;
  }
  unifiRefreshPromise = (async () => {
    try {
      state.unifiNetwork = await fetchUnifiNetworkSummary(config);
    } catch (error) {
      state.unifiNetwork = {
        ...(state.unifiNetwork || emptyUnifiNetworkState()),
        configured: true,
        error: error.message || "Falha ao consultar o UniFi Network."
      };
      throw error;
    } finally {
      scheduleSave();
      scheduleBroadcastSnapshot();
      unifiRefreshPromise = null;
    }
  })();
  return unifiRefreshPromise;
}

async function refreshProxmoxBackup() {
  const config = getProxmoxConfig();
  if (!config) {
    state.proxmoxBackup = emptyProxmoxBackupState();
    return;
  }
  try {
    const previousProxmoxBackup = state.proxmoxBackup || emptyProxmoxBackupState();
    const nextProxmoxBackup = await fetchProxmoxBackupSummary(config);
    state.proxmoxBackup = withProxmoxDatastoreHistory(previousProxmoxBackup, nextProxmoxBackup);
  } catch (error) {
    state.proxmoxBackup = {
      ...(state.proxmoxBackup || emptyProxmoxBackupState()),
      configured: true,
      error: error.message || "Falha ao consultar o Proxmox Backup Server."
    };
    throw error;
  } finally {
    scheduleSave();
    scheduleBroadcastSnapshot();
  }
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
  return compareVersions(probe.version, expectedProbeVersion(probe)) < 0 ? "outdated" : "current";
}

function probeUpdateSupported(probe) {
  return PROBE_UPDATE_SUPPORTED_PLATFORMS.has(normalizeProbePlatform(probe.platform, null));
}

function activeProbeUpdateRequest(probeId) {
  return (state.probeUpdateRequests || []).find(
    (request) => request.probeId === probeId && ["pending", "running"].includes(request.status)
  ) || null;
}

function latestProbeUpdateRequest(probeId) {
  return (state.probeUpdateRequests || [])
    .filter((request) => request.probeId === probeId)
    .sort((left, right) => new Date(right.requestedAt || 0).getTime() - new Date(left.requestedAt || 0).getTime())[0] || null;
}

function publicProbeUpdateRequest(request) {
  if (!request) return null;
  return {
    id: request.id,
    probeId: request.probeId,
    targetVersion: request.targetVersion,
    status: request.status,
    requestedAt: request.requestedAt || null,
    startedAt: request.startedAt || null,
    finishedAt: request.finishedAt || null,
    error: request.error || null
  };
}

function publicProbe(probe) {
  const servers = listedServers().filter((server) => server.checkSource === "probe" && server.probeId === probe.id);
  const staleServers = servers.filter((server) => probeConnection(server).status === "stale").length;
  const versionStatus = probeVersionStatus(probe);
  const updateRequest = probeUpdateSupported(probe)
    ? activeProbeUpdateRequest(probe.id) || latestProbeUpdateRequest(probe.id)
    : null;
  const visibleUpdateRequest =
    updateRequest?.status === "failed" && versionStatus === "outdated" ? null : updateRequest;
  return {
    id: probe.id,
    name: probe.name || probe.id,
    probeType: probe.probeType || "host",
    discoveredGatewayIp: probe.discoveredGatewayIp || null,
    discoveredGatewayReportedAt: probe.discoveredGatewayReportedAt || null,
    version: probe.version || null,
    latestVersion: expectedProbeVersion(probe),
    versionStatus,
    updateAvailable: versionStatus === "outdated",
    updateSupported: probeUpdateSupported(probe),
    updateRequest: publicProbeUpdateRequest(visibleUpdateRequest),
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
    staleTargetCount: staleServers,
    // Teste ativo de banda (download real, nao so trafego observado por SNMP)
    // — so existe pra Network Probes, ver runSpeedTest() em network-collector.js.
    speedTestDownloadMbps: probe.speedTestDownloadMbps ?? null,
    speedTestUploadMbps: probe.speedTestUploadMbps ?? null,
    speedTestAt: probe.speedTestAt || null,
    speedTestPending: Boolean(probe.forceSpeedTestAt)
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
    probeToken: isAdminUser(currentUser) ? getProbeToken() : "",
    probeTokenSource: process.env.SERVERWATCH_PROBE_TOKEN ? "environment" : "generated",
    cloudBackupConfigured: Boolean(getCloudBackupApiKey()),
    cloudBackupSource: process.env.CLOUDBACKUP_API_KEY ? "environment" : state.settings.cloudBackupApiKey ? "configured" : "none",
    cloudBackupApiKey: isAdminUser(currentUser) ? getCloudBackupApiKey() : "",
    proxmoxConfigured: Boolean(getProxmoxConfig()),
    proxmoxSource: process.env.PROXMOX_PBS_BASE_URL ? "environment" : state.settings.proxmoxPbsBaseUrl ? "configured" : "none",
    proxmoxBaseUrl: isAdminUser(currentUser) ? state.settings.proxmoxPbsBaseUrl || process.env.PROXMOX_PBS_BASE_URL || "" : "",
    proxmoxTokenId: isAdminUser(currentUser) ? state.settings.proxmoxPbsTokenId || process.env.PROXMOX_PBS_TOKEN_ID || "" : "",
    proxmoxTokenSecret: isAdminUser(currentUser)
      ? state.settings.proxmoxPbsTokenSecret || process.env.PROXMOX_PBS_TOKEN_SECRET || ""
      : "",
    proxmoxTlsFingerprint: isAdminUser(currentUser)
      ? state.settings.proxmoxPbsTlsFingerprint || process.env.PROXMOX_PBS_TLS_FINGERPRINT || ""
      : "",
    unifiConfigured: Boolean(getUnifiConfig()),
    unifiSource: process.env.UNIFI_BASE_URL ? "environment" : state.settings.unifiBaseUrl ? "configured" : "none",
    unifiBaseUrl: isAdminUser(currentUser) ? state.settings.unifiBaseUrl || process.env.UNIFI_BASE_URL || "" : "",
    unifiApiKey: isAdminUser(currentUser) ? state.settings.unifiApiKey || process.env.UNIFI_API_KEY || "" : "",
    unifiTlsFingerprint: isAdminUser(currentUser)
      ? state.settings.unifiTlsFingerprint || process.env.UNIFI_TLS_FINGERPRINT || ""
      : "",
    unifiApiBasePath: isAdminUser(currentUser)
      ? state.settings.unifiApiBasePath || process.env.UNIFI_API_BASE_PATH || "/proxy/network/integration"
      : ""
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

function metricText(value, maxLength = 200) {
  const text = String(value || "").trim();
  return text ? text.slice(0, maxLength) : null;
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
  const diskPartitions = Array.isArray(metrics.diskPartitions)
    ? metrics.diskPartitions
        .map((item) => ({
          mount: metricText(item?.mount, 120),
          label: metricText(item?.label, 120),
          filesystem: metricText(item?.filesystem, 80),
          totalBytes: normalizeNumber(item?.totalBytes),
          usedBytes: normalizeNumber(item?.usedBytes),
          freeBytes: normalizeNumber(item?.freeBytes),
          usedPercent: normalizeNumber(item?.usedPercent)
        }))
        .filter((item) => item.mount || item.filesystem)
        .slice(0, 24)
    : [];
  const listeningPorts = Array.isArray(metrics.listeningPorts)
    ? metrics.listeningPorts
        .map((item) => ({
          protocol: metricText(item?.protocol, 16) || "tcp",
          address: metricText(item?.address, 120),
          port: normalizeNumber(item?.port),
          processId: normalizeNumber(item?.processId)
        }))
        .filter((item) => item.port !== null && item.port > 0 && item.port <= 65535)
        .slice(0, 64)
    : [];
  const services = Array.isArray(metrics.services)
    ? metrics.services
        .map((item) => ({
          name: metricText(item?.name, 120),
          displayName: metricText(item?.displayName, 160),
          status: metricText(item?.status, 80),
          active: metricText(item?.active, 80),
          load: metricText(item?.load, 80),
          startType: metricText(item?.startType, 80)
        }))
        .filter((item) => item.name || item.displayName)
        .slice(0, 32)
    : [];
  const topProcesses = Array.isArray(metrics.topProcesses)
    ? metrics.topProcesses
        .map((item) => ({
          name: metricText(item?.name, 120),
          processId: normalizeNumber(item?.processId),
          cpuPercent: normalizeNumber(item?.cpuPercent),
          cpuSeconds: normalizeNumber(item?.cpuSeconds),
          memoryPercent: normalizeNumber(item?.memoryPercent),
          memoryBytes: normalizeNumber(item?.memoryBytes)
        }))
        .filter((item) => item.name)
        .slice(0, 10)
    : [];
  const criticalEvents = Array.isArray(metrics.criticalEvents)
    ? metrics.criticalEvents
        .map((item) => ({
          createdAt: metricText(item?.createdAt, 80),
          source: metricText(item?.source, 160),
          eventId: normalizeNumber(item?.eventId),
          level: metricText(item?.level, 80),
          message: metricText(item?.message, 500)
        }))
        .filter((item) => item.message || item.source)
        .slice(0, 10)
    : [];
  const virtualization = Array.isArray(metrics.virtualization)
    ? metrics.virtualization
        .map((item) => ({
          type: metricText(item?.type, 40),
          id: metricText(item?.id, 80),
          name: metricText(item?.name, 160),
          state: metricText(item?.state, 80),
          memoryBytes: normalizeNumber(item?.memoryBytes),
          memoryMb: normalizeNumber(item?.memoryMb),
          cpuCount: normalizeNumber(item?.cpuCount)
        }))
        .filter((item) => item.name || item.id)
        .slice(0, 64)
    : [];
  const proxmoxStorage = Array.isArray(metrics.proxmoxStorage)
    ? metrics.proxmoxStorage
        .map((item) => ({
          name: metricText(item?.name, 120),
          type: metricText(item?.type, 80),
          status: metricText(item?.status, 80),
          totalBytes: normalizeNumber(item?.totalBytes),
          usedBytes: normalizeNumber(item?.usedBytes),
          availableBytes: normalizeNumber(item?.availableBytes),
          usedPercent: normalizeNumber(item?.usedPercent)
        }))
        .filter((item) => item.name)
        .slice(0, 32)
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
    diskPartitions,
    listeningPorts,
    services,
    topProcesses,
    criticalEvents,
    virtualization,
    proxmoxStorage,
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

function finishProbeUpdateIfCurrent(probe) {
  if (!probe?.version) return false;
  const request = activeProbeUpdateRequest(probe.id);
  if (!request || compareVersions(probe.version, request.targetVersion) < 0) return false;
  request.status = "succeeded";
  request.finishedAt = nowIso();
  request.error = null;
  const server = linkedServerForProbe(probe.id);
  if (server) addProbeEvent(server, "probe_update_succeeded", `Atualizacao do probe concluida em ${probe.version}.`);
  return true;
}

function createProbeUpdateRequest(probe, requestedBy = "Sistema") {
  if (!probe) return { error: "Probe nao encontrado.", status: 404 };
  if (!probeUpdateSupported(probe)) {
    return { error: "Atualizacao remota automatica esta disponivel apenas para probes Linux.", status: 409 };
  }
  if (probeVersionStatus(probe) !== "outdated") {
    return { error: "Este probe ja esta na versao atual.", status: 409 };
  }
  const active = activeProbeUpdateRequest(probe.id);
  if (active) return { request: active, created: false };
  const request = {
    id: randomUUID(),
    probeId: probe.id,
    targetVersion: expectedProbeVersion(probe),
    status: "pending",
    requestedAt: nowIso(),
    requestedBy,
    startedAt: null,
    finishedAt: null,
    error: null
  };
  state.probeUpdateRequests.unshift(request);
  state.probeUpdateRequests = state.probeUpdateRequests.slice(0, 500);
  const server = linkedServerForProbe(probe.id);
  if (server) addProbeEvent(server, "probe_update_requested", `Atualizacao do probe solicitada para ${request.targetVersion}.`);
  return { request, created: true };
}

function upsertProbe({
  probeId,
  name,
  version,
  hostName,
  primaryAddress,
  addresses,
  platform,
  primaryMac,
  macAddresses,
  hostMetrics,
  remoteAddress,
  probeType,
  discoveredGatewayIp
}) {
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
    probeType: probeType === "network" ? "network" : existing?.probeType || "host",
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
  if (discoveredGatewayIp !== undefined) {
    const trimmedGateway = String(discoveredGatewayIp || "").trim();
    payload.discoveredGatewayIp = trimmedGateway || null;
    payload.discoveredGatewayReportedAt = trimmedGateway ? nowIso() : existing?.discoveredGatewayReportedAt || null;
  }
  if (existing) {
    const previousVersion = existing.version || null;
    let changed =
      existing.name !== payload.name ||
      existing.probeType !== payload.probeType ||
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
    if (finishProbeUpdateIfCurrent(existing)) changed = true;
    recordProbeMetrics(id, normalizedHostMetrics);
    return { probe: existing, changed };
  }
  const probe = { createdAt: nowIso(), ...payload };
  state.probes.push(probe);
  finishProbeUpdateIfCurrent(probe);
  recordProbeMetrics(id, normalizedHostMetrics);
  return { probe, changed: true };
}

function ensureProbeServer(probe) {
  const hostname = String(probe.primaryAddress || probe.addresses?.[0] || "").trim();
  if (!hostname) return { server: null, changed: false };

  const serverName = String(probe.name || probe.hostName || probe.id).trim();
  const existing =
    state.servers.find(
    (server) => !server.deletedAt && server.checkSource === "probe" && server.probeId === probe.id
    ) ||
    state.servers.find(
      (server) => server.deletedAt && server.autoCreatedByProbe && server.checkSource === "probe" && server.probeId === probe.id
    );

  if (existing) {
    let changed = false;
    const seenAt = probe.lastSeenAt || nowIso();
    const previousStatus = existing.currentStatus || "unknown";
    if (existing.deletedAt) {
      existing.deletedAt = null;
      changed = true;
    }
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
    if (existing.lastProbeSeenAt !== seenAt) {
      existing.lastProbeSeenAt = seenAt;
      changed = true;
    }
    existing.probeEventStatus = "online";
    existing.probeFallbackStatus = null;
    existing.probeFallbackCheckedAt = null;
    if (existing.currentStatus !== "online") {
      existing.currentStatus = "online";
      existing.consecutiveFailures = 0;
      existing.lastCheckedAt = seenAt;
      existing.lastLatencyMs = existing.lastLatencyMs ?? 0;
      existing.lastError = null;
      existing.previousStatus = previousStatus;
      existing.statusChangedAt = seenAt;
      addEvent(existing, previousStatus, "online", existing.lastLatencyMs, `Contato recebido do probe ${probe.id}.`);
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
    currentStatus: "online",
    previousStatus: "unknown",
    statusChangedAt: createdAt,
    lastCheckedAt: probe.lastSeenAt || createdAt,
    lastLatencyMs: 0,
    lastError: null,
    lastProbeSeenAt: probe.lastSeenAt || createdAt,
    probeEventStatus: "online",
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
  const updateRequest = activeProbeUpdateRequest(probeId);
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
  const networkLinks = listedNetworkLinks()
    .filter((link) => link.isActive !== false && link.probeId === probeId)
    .map((link) => ({
      id: link.id,
      name: link.name,
      targetHost: link.targetHost,
      targetHosts: Array.isArray(link.targetHosts) && link.targetHosts.length ? link.targetHosts : [link.targetHost].filter(Boolean),
      targets: Array.isArray(link.targets) && link.targets.length
        ? link.targets
        : (Array.isArray(link.targetHosts) && link.targetHosts.length ? link.targetHosts : [link.targetHost].filter(Boolean)).map((host) => ({ name: "", host })),
      checkMethod: "ping",
      checkInterval: link.checkInterval,
      failureThreshold: link.failureThreshold,
      degradedLatencyMs: link.degradedLatencyMs,
      degradedPacketLossPercent: link.degradedPacketLossPercent,
      degradedJitterMs: link.degradedJitterMs,
      sampleCount: link.sampleCount || 3,
      forceCheck: Boolean(
        link.forceCheckAt &&
          (!link.lastCheckedAt || new Date(link.forceCheckAt).getTime() > new Date(link.lastCheckedAt).getTime())
      )
    }));

  return {
    targets: [...ownedTargets, ...verificationTargets],
    networkLinks,
    updateRequest:
      updateRequest?.status === "pending"
        ? {
            id: updateRequest.id,
            probeId: updateRequest.probeId,
            targetVersion: updateRequest.targetVersion,
            requestedAt: updateRequest.requestedAt
          }
        : null
  };
}

// Dispositivos SNMP atribuidos a um Network Probe, com a community string em
// texto puro — so sai do servidor aqui, autenticado por token de probe, nunca
// via sessao de usuario (ver publicNetworkDevice, que expoe so snmpCommunitySet).
function networkDeviceTargets(networkProbeId) {
  return listedNetworkDevices()
    .filter((device) => device.networkProbeId === networkProbeId && device.snmpEnabled && device.managementIp)
    .map((device) => ({
      deviceId: device.id,
      managementIp: device.managementIp,
      snmpCommunity: device.snmpCommunity || "",
      snmpPort: device.snmpPort || 161,
      vendor: device.vendor || "generic",
      interfaces: listedNetworkLinks()
        .filter((link) => link.networkDeviceId === device.id && link.snmpIfIndex != null && link.isActive !== false)
        .map((link) => ({ linkId: link.id, snmpIfIndex: link.snmpIfIndex }))
    }));
}

// Probes de rede que ja reportaram um gateway detectado automaticamente mas
// ainda nao tem nenhum networkDevice cadastrado com esse IP — vira sugestao
// de cadastro na tela de Redes.
function networkDiscoverySuggestions() {
  const knownManagementIps = new Set(listedNetworkDevices().map((device) => device.managementIp).filter(Boolean));
  return (state.probes || [])
    .filter(
      (probe) =>
        !probe.deletedAt &&
        (probe.probeType || "host") === "network" &&
        probe.discoveredGatewayIp &&
        !knownManagementIps.has(probe.discoveredGatewayIp)
    )
    .map((probe) => ({
      probeId: probe.id,
      probeName: probe.name || probe.id,
      discoveredGatewayIp: probe.discoveredGatewayIp,
      discoveredGatewayReportedAt: probe.discoveredGatewayReportedAt || null
    }));
}

function applyProbeResult(server, result, probeId, options = {}) {
  const verification = Boolean(options.verification);
  const wasProbeStale = !verification && server.probeEventStatus === "stale";
  if (!verification) {
    server.lastProbeSeenAt = nowIso();
    server.probeEventStatus = "online";
    server.probeFallbackStatus = null;
    server.probeFallbackCheckedAt = null;
  } else {
    server.probeFallbackStatus = result.online ? "confirmed_online" : "confirmed_offline";
    server.probeFallbackCheckedAt = result.checkedAt || nowIso();
  }
  server.probeCheckRequestedAt = null;
  const resultError = verification
    ? result.online
      ? `Probe local sem contato; servidor respondeu via probe ${probeId}.`
      : `Probe local sem contato; servidor nao respondeu via probe ${probeId}. ${result.error || "Sem resposta ao ping."}`
    : result.error || null;
  const transition = applyMonitorResult(server, { ...result, error: resultError }, { checkedAt: result.checkedAt || nowIso() });

  if (transition.statusChanged) {
    server.previousStatus = transition.previousStatus;
    server.statusChangedAt = server.lastCheckedAt;
    addEvent(
      server,
      transition.previousStatus,
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

function getSession(req) {
  const token = parseCookies(req)[SESSION_COOKIE];
  if (!token) return null;
  const session = sessions.get(token);
  const now = Date.now();
  if (!session || session.expiresAt <= now) {
    sessions.delete(token);
    state.sessions = (state.sessions || []).filter((s) => s.token !== token);
    return null;
  }
  const user = listedUsers().find((item) => item.id === session.userId && item.isActive !== false);
  if (!user) {
    sessions.delete(token);
    state.sessions = (state.sessions || []).filter((s) => s.token !== token);
    return null;
  }
  // Sliding window: renew if more than 1 day has elapsed since last renewal
  if (session.expiresAt - now < SESSION_TTL_MS - 24 * 60 * 60 * 1000) {
    session.expiresAt = now + SESSION_TTL_MS;
    const idx = (state.sessions || []).findIndex((s) => s.token === token);
    if (idx !== -1) state.sessions[idx].expiresAt = session.expiresAt;
    scheduleSave();
  }
  return { token, user };
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
  if (!isAdminUser(session.user)) {
    sendJson(res, 403, { error: "Apenas administradores podem executar esta acao." });
    return null;
  }
  return session;
}

async function handleApi(req, res) {
  const { parts, url } = getRouteParts(req);
  try {
    if (req.method === "GET" && parts.length === 1 && parts[0] === "health") {
      return sendJson(res, 200, healthPayload());
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
        const expiresAt = Date.now() + SESSION_TTL_MS;
        sessions.set(token, { userId: user.id, expiresAt });
        state.sessions = [...(state.sessions || []), { token, userId: user.id, expiresAt }];
        user.lastLoginAt = nowIso();
        user.updatedAt = user.updatedAt || user.lastLoginAt;
        scheduleSave();
        setSessionCookie(res, SESSION_COOKIE, token, SESSION_TTL_MS);
        return sendJson(res, 200, { user: publicUser(user), requirePasswordChange: user.mustChangePassword === true });
      }

      if (req.method === "POST" && parts[2] === "password") {
        const session = requireSession(req, res);
        if (!session) return;
        const payload = await readBody(req);
        const currentPassword = String(payload.currentPassword || "");
        const newPassword = String(payload.newPassword || "");
        if (!verifyPassword(currentPassword, session.user.passwordHash)) {
          return sendJson(res, 401, { error: "Senha atual invalida." });
        }
        if (newPassword.length < 8) {
          return sendJson(res, 400, { error: "A nova senha deve ter pelo menos 8 caracteres." });
        }
        if (verifyPassword(newPassword, session.user.passwordHash)) {
          return sendJson(res, 400, { error: "A nova senha deve ser diferente da senha atual." });
        }
        session.user.passwordHash = hashPassword(newPassword);
        session.user.mustChangePassword = false;
        session.user.updatedAt = nowIso();
        scheduleSave();
        broadcastSnapshot();
        return sendJson(res, 200, { user: publicUser(session.user), requirePasswordChange: false });
      }

      if (req.method === "POST" && parts[2] === "logout") {
        const session = getSession(req);
        if (session) {
          sessions.delete(session.token);
          state.sessions = (state.sessions || []).filter((s) => s.token !== session.token);
          scheduleSave();
        }
        clearSessionCookie(res, SESSION_COOKIE);
        return sendJson(res, 200, { ok: true });
      }
    }

    if (req.method === "GET" && parts[1] === "metrics" && parts[2] === "history") {
      const session = requireSession(req, res);
      if (!session) return;
      const probeId = url.searchParams.get("probeId");
      if (!probeId) return sendJson(res, 400, { error: "Informe probeId." });
      const type = url.searchParams.get("type") === "long" ? "long" : "short";
      const entry = metricsHistory.get(probeId);
      return sendJson(res, 200, { probeId, type, samples: entry ? entry[type] : [] });
    }

    // Historico agregado de banda (soma de todos os links SNMP "featured" da
    // empresa) — alimenta o grafico de variacao de velocidade na visao de
    // empresa da pagina Redes. Agrupa amostras de cada link por minuto.
    if (req.method === "GET" && parts[1] === "network" && parts[2] === "groups" && parts[4] === "bps-history") {
      const session = requireSession(req, res);
      if (!session) return;
      const groupId = decodeURIComponent(parts[3] || "");
      if (groupId !== "none" && !canAccessGroup(session.user, groupId)) {
        return sendJson(res, 403, { error: "Sem acesso a esta empresa." });
      }
      const links = listedNetworkLinks().filter(
        (link) => (link.groupId || "none") === groupId && link.featured !== false && link.snmpIfIndex != null
      );
      const buckets = new Map();
      for (const link of links) {
        const entry = networkLinkBpsHistory.get(link.id);
        if (!entry) continue;
        for (const sample of entry.samples) {
          const bucketKey = Math.round(sample.t / 60_000) * 60_000;
          const bucket = buckets.get(bucketKey) || { t: bucketKey, inBps: 0, outBps: 0 };
          bucket.inBps += Number(sample.inBps) || 0;
          bucket.outBps += Number(sample.outBps) || 0;
          buckets.set(bucketKey, bucket);
        }
      }
      const samples = Array.from(buckets.values()).sort((a, b) => a.t - b.t);
      return sendJson(res, 200, { groupId, linkCount: links.length, samples });
    }

    // Historico do teste ATIVO de velocidade de um probe (nao o trafego
    // passivo) — alimenta o grafico "Capacidade real" no detalhe do probe.
    if (req.method === "GET" && parts[1] === "probes" && parts[3] === "speed-test-history") {
      if (!requireAdmin(req, res)) return;
      const probeId = decodeURIComponent(parts[2] || "");
      const entry = probeSpeedTestHistory.get(probeId);
      return sendJson(res, 200, { probeId, samples: entry ? entry.samples : [] });
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
        if (registered.changed || ensuredServer.changed) scheduleBroadcastSnapshot();
        const probeWork = probeTargets(registered.probe.id);
        return sendJson(res, 200, {
          probe: publicProbe(registered.probe),
          targets: probeWork.targets,
          networkLinks: probeWork.networkLinks,
          updateRequest: probeWork.updateRequest
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
        const networkResults = Array.isArray(payload.networkResults) ? payload.networkResults : [];
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
        let acceptedNetworkResults = 0;
        for (const result of networkResults) {
          const link = (state.networkLinks || []).find((item) => item.id === result.linkId && !item.deletedAt);
          if (!link || link.probeId !== probe.id) continue;
          if (applyNetworkLinkResult(link, result, probe.id)) acceptedNetworkResults += 1;
        }
        scheduleSave();
        if (registered.changed || ensuredServer.changed || accepted > 0 || acceptedNetworkResults > 0) scheduleBroadcastSnapshot();
        return sendJson(res, 200, { ok: true, accepted, acceptedNetworkResults });
      }

      if (req.method === "POST" && parts[2] === "update-status") {
        const payload = await readBody(req);
        const probeId = String(payload.probeId || "").trim();
        const requestId = String(payload.requestId || "").trim();
        const status = String(payload.status || "").trim();
        const request = (state.probeUpdateRequests || []).find(
          (item) => item.id === requestId && item.probeId === probeId
        );
        if (!request) return sendJson(res, 404, { error: "Solicitacao de atualizacao nao encontrada." });
        if (!["running", "failed", "unsupported", "succeeded"].includes(status)) {
          return sendJson(res, 400, { error: "Status de atualizacao invalido." });
        }
        request.status = status;
        request.error = payload.error ? String(payload.error).slice(0, 500) : null;
        if (status === "running") request.startedAt = request.startedAt || nowIso();
        if (["failed", "unsupported", "succeeded"].includes(status)) request.finishedAt = nowIso();
        const server = linkedServerForProbe(probeId);
        if (server && status !== "running") {
          addProbeEvent(
            server,
            `probe_update_${status}`,
            status === "succeeded"
              ? `Atualizacao do probe concluida em ${request.targetVersion}.`
              : `Atualizacao do probe nao foi concluida: ${request.error || status}.`
          );
        }
        scheduleSave();
        broadcastSnapshot();
        return sendJson(res, 200, { ok: true, request: publicProbeUpdateRequest(request) });
      }
    }

    if (parts[1] === "network-probe") {
      if (!authorizeProbe(req)) {
        return sendJson(res, 401, { error: "Token do Network Probe invalido." });
      }

      if (req.method === "GET" && parts[2] === "validate") {
        return sendJson(res, 200, {
          ok: true,
          service: "serverwatch",
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
          remoteAddress: req.socket.remoteAddress,
          probeType: "network",
          discoveredGatewayIp: url.searchParams.get("discoveredGatewayIp") || undefined
        });
        if (!registered) return sendJson(res, 400, { error: "Informe probeId." });
        // Diferente do probe de host, aqui NAO chamamos ensureProbeServer — um
        // network probe nunca deve virar um "servidor" fantasma no inventario.
        scheduleSave();
        if (registered.changed) scheduleBroadcastSnapshot();
        return sendJson(res, 200, {
          probe: publicProbe(registered.probe),
          targets: networkDeviceTargets(registered.probe.id),
          // Teste de velocidade ativo solicitado manualmente (botao "Testar
          // agora") — o coletor roda fora do ciclo horario quando ve isto.
          forceSpeedTestAt: registered.probe.forceSpeedTestAt || null,
          // Atualizacao remota — o probe de host ja consumia isto, o network
          // probe nunca recebia porque essa rota nao incluia o campo.
          updateRequest: activeProbeUpdateRequest(registered.probe.id)
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
          remoteAddress: req.socket.remoteAddress,
          probeType: "network",
          discoveredGatewayIp: payload.discoveredGatewayIp ?? undefined
        });
        if (!registered) return sendJson(res, 400, { error: "Informe probeId." });
        const probe = registered.probe;
        const deviceResults = Array.isArray(payload.deviceResults) ? payload.deviceResults : [];
        let acceptedDevices = 0;
        let acceptedInterfaces = 0;
        for (const deviceResult of deviceResults) {
          const device = listedNetworkDevices().find((item) => item.id === deviceResult.deviceId);
          if (!device || device.networkProbeId !== probe.id) continue;
          acceptedInterfaces += applyNetworkDeviceSnmpResult(device, deviceResult, probe.id);
          acceptedDevices += 1;
        }
        // Resultado do teste ativo de banda (download/upload real, medido
        // contra um servidor externo — nao e o mesmo dado que o trafego SNMP
        // passivo). So existe pra Network Probes, ver runSpeedTest().
        let speedTestApplied = false;
        const speedTest = payload.speedTest;
        if (speedTest && Number.isFinite(Number(speedTest.downloadMbps))) {
          probe.speedTestDownloadMbps = Number(speedTest.downloadMbps);
          probe.speedTestUploadMbps = Number.isFinite(Number(speedTest.uploadMbps)) ? Number(speedTest.uploadMbps) : null;
          probe.speedTestAt = speedTest.testedAt || nowIso();
          probe.forceSpeedTestAt = null;
          speedTestApplied = true;
          recordProbeSpeedTest(probe.id, probe.speedTestDownloadMbps, probe.speedTestUploadMbps, probe.speedTestAt);
        }
        scheduleSave();
        if (registered.changed || acceptedDevices > 0 || acceptedInterfaces > 0 || speedTestApplied) scheduleBroadcastSnapshot();
        return sendJson(res, 200, { ok: true, acceptedDevices, acceptedInterfaces });
      }
    }

    const session = requireSession(req, res);
    if (!session) return;

    if (handleMeta(req, res, { parts, session })) return;

    if (parts[1] === "probes") {
      if (handleProbes(req, res, { parts, session })) return;
    }

    if (parts[1] === "settings") {
      if (await handleSettings(req, res, { parts, session })) return;
    }

    if (parts[1] === "users") {
      if (await handleUsers(req, res, { parts, session })) return;
    }

    if (parts[1] === "groups") {
      if (await handleGroups(req, res, { parts, session })) return;
    }

    if (parts[1] === "network") {
      if (await handleNetwork(req, res, { parts, session })) return;
    }

    if (parts[1] === "backups") {
      if (await handleBackups(req, res, { parts, session })) return;
    }

    if (parts[1] === "proxmox-backups") {
      if (await handleProxmoxBackups(req, res, { parts, session })) return;
    }

    if (parts[1] === "unifi-network") {
      if (await handleUnifiNetwork(req, res, { parts, session })) return;
    }

    if (parts[1] === "servers") {
      if (handleServerRead(req, res, { parts, url, session })) return;

      if (!requireAdmin(req, res)) return;

      if (await handleServerCreate(req, res, { parts, session })) return;
      if (await handleServerMutation(req, res, { parts, session })) return;
      if (await handleServerCheck(req, res, { parts, session })) return;
      return notFound(res);
    }

    if (parts[1] === "alerts") {
      if (await handleAlerts(req, res, { parts, session })) return;
    }

    notFound(res);
  } catch (error) {
    if (res.headersSent) {
      console.error(error);
      return;
    }
    sendJson(res, error.statusCode || 500, { error: error.message || "Erro interno." });
  }
}

function scopedRealtimePayload(user, payload) {
  if (!payload || !user || isAdminUser(user)) return payload;
  if (payload.server && !canAccessServer(user, payload.server.id)) return null;
  if (payload.event && !canAccessEvent(user, payload.event)) return null;
  if (payload.alert && !canAccessAlert(user, payload.alert)) return null;
  const scoped = { ...payload };
  if (payload.summary) scoped.summary = summary(user);
  if (payload.networkSummary) scoped.networkSummary = networkSummary(user);
  return scoped;
}

const webSocketHub = createWebSocketHub({
  getSession,
  getFreshUser: (id) => listedUsers().find((user) => user.id === id && user.isActive !== false),
  snapshot,
  filterPayload: scopedRealtimePayload
});
const { broadcast, broadcastSnapshot, handleUpgrade } = webSocketHub;
const healthPayload = createHealthHandler({
  nowIso,
  uptimeSeconds: () => Math.round(process.uptime())
});
const serveDownload = createDownloadHandler({
  downloads: DOWNLOADS,
  getSession,
  authorizeProbe,
  sendJson,
  notFound
});
const handleSettings = createSettingsHandler({
  readBody,
  sendJson,
  requireAdmin,
  getSettings: () => state.settings,
  setSettings: (settings) => {
    state.settings = settings;
  },
  normalizeBranding,
  normalizeAlertSettings,
  normalizeCloudBackupSettings,
  normalizeProxmoxSettings,
  normalizeUnifiSettings,
  refreshCloudBackup,
  refreshProxmoxBackup,
  refreshUnifiNetwork,
  publicSettings,
  scheduleSave,
  broadcastSnapshot
});
const handleUsers = createUsersHandler({
  randomId: randomUUID,
  nowIso,
  readBody,
  sendJson,
  notFound,
  requireAdmin,
  listedUsers: () => state.users.filter((user) => !user.deletedAt),
  addUser: (user) => state.users.unshift(user),
  publicUser,
  normalizeUser,
  activeAdminCount,
  scheduleSave
});
const handleGroups = createGroupsHandler({
  randomId: randomUUID,
  nowIso,
  readBody,
  sendJson,
  notFound,
  requireAdmin,
  listedGroups,
  visibleGroups,
  listedServers,
  listedNetworkDevices,
  listedNetworkLinks,
  publicGroup,
  normalizeGroup,
  addGroup: (group) => state.groups.unshift(group),
  scheduleSave,
  broadcastSnapshot
});
const handleNetwork = createNetworkHandler({
  randomId: randomUUID,
  nowIso,
  readBody,
  sendJson,
  notFound,
  requireAdmin,
  getDevices: (user = null) => scopedNetworkDevices(user),
  getLinks: (user = null) => scopedNetworkLinks(user),
  publicDevice: publicNetworkDevice,
  publicLink: publicNetworkLink,
  normalizeDevice: normalizeNetworkDevice,
  normalizeLink: normalizeNetworkLink,
  addDevice: (device) => state.networkDevices.unshift(device),
  addLink: (link) => state.networkLinks.unshift(link),
  scheduleSave,
  broadcastSnapshot
});

const handleBackups = createBackupsHandler({
  sendJson,
  readBody,
  requireAdmin,
  getCloudBackupState: (user = null) => scopedCloudBackup(user),
  refreshCloudBackup,
  linkCloudBackupClient: setCloudBackupClientLink
});
const handleProxmoxBackups = createProxmoxBackupsHandler({
  sendJson,
  readBody,
  requireAdmin,
  getProxmoxBackupState: (user = null) => scopedProxmoxBackup(user),
  refreshProxmoxBackup,
  linkProxmoxNamespace,
  linkProxmoxServer
});
const handleUnifiNetwork = createUnifiNetworkHandler({
  sendJson,
  readBody,
  requireAdmin,
  getUnifiNetworkState: (user = null) => scopedUnifiNetwork(user),
  refreshUnifiNetwork,
  linkUnifiSite
});
const handleAlerts = createAlertsHandler({
  nowIso,
  readBody,
  sendJson,
  notFound,
  requireAdmin,
  getAlerts: (user = null) => scopedAlerts(user),
  getAllAlerts: () => state.alerts,
  setAlerts: (alerts) => {
    state.alerts = alerts;
  },
  scheduleSave,
  broadcastSnapshot
});
const handleMeta = createMetaHandler({
  sendJson,
  summary,
  snapshot,
  getEvents: (user = null) => scopedEvents(user)
});
const handleProbes = createProbesHandler({
  sendJson,
  notFound,
  requireAdmin,
  getProbes: () => state.probes || [],
  listedServers,
  publicProbe,
  publicProbeUpdateRequest,
  probeVersionStatus,
  probeUpdateSupported,
  createProbeUpdateRequest,
  nowIso,
  scheduleSave,
  broadcastSnapshot
});
const handleServerRead = createServerReadHandler({
  sendJson,
  notFound,
  listedServers: (user = null) => scopedServers(user),
  publicServer,
  getEvents: (user = null) => scopedEvents(user)
});
const handleServerCreate = createServerCreateHandler({
  randomId: randomUUID,
  nowIso,
  nowMs: Date.now,
  readBody,
  sendJson,
  normalizeServer,
  addServer: (server) => state.servers.unshift(server),
  addAdministrativeEvent,
  syncVirtualizerChildren,
  scheduleSave,
  broadcastSnapshot,
  publicServer
});
const handleServerMutation = createServerMutationHandler({
  nowIso,
  nowMs: Date.now,
  readBody,
  sendJson,
  notFound,
  getServer: (id) => state.servers.find((item) => item.id === id && !item.deletedAt),
  normalizeServer,
  addAdministrativeEvent,
  syncVirtualizerChildren,
  scheduleSave,
  broadcastSnapshot,
  publicServer
});
const handleServerCheck = createServerCheckHandler({
  nowIso,
  nowMs: Date.now,
  sendJson,
  notFound,
  getServer: (id) => state.servers.find((item) => item.id === id && !item.deletedAt),
  publicServer,
  addAdministrativeEvent,
  scheduleSave,
  broadcast,
  summary,
  checkServer
});
const serveStatic = createStaticHandler({
  publicDir: PUBLIC_DIR,
  getTheme: () => (state.settings.theme === "dark" ? "dark" : "light"),
  notFound
});
const alertService = createAlertService({
  getState: () => state,
  randomId: randomUUID,
  nowIso,
  trimEvents,
  broadcast,
  summary,
  publicServer
});
({ addEvent, addAdministrativeEvent, addProbeEvent } = alertService);

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
await loadMetricsHistory();
await loadNetworkLinkBpsHistory();
await loadProbeSpeedTestHistory();
startMonitor();
refreshCloudBackup().catch((error) => console.error("Falha ao buscar backups na inicializacao", error));
refreshProxmoxBackup().catch((error) => console.error("Falha ao buscar Proxmox Backup Server na inicializacao", error));
refreshUnifiNetwork().catch((error) => console.error("Falha ao buscar UniFi Network na inicializacao", error));
runCentralSnmpCycle().catch((error) => console.error("Falha na coleta SNMP central na inicializacao", error));
checkContractExpirations();
setInterval(() => {
  refreshCloudBackup().catch((error) => console.error("Falha ao atualizar backups", error));
}, CLOUDBACKUP_POLL_MS);
setInterval(() => {
  refreshProxmoxBackup().catch((error) => console.error("Falha ao atualizar Proxmox Backup Server", error));
}, PROXMOX_POLL_MS);
setInterval(() => {
  refreshUnifiNetwork().catch((error) => console.error("Falha ao atualizar UniFi Network", error));
}, UNIFI_POLL_MS);
setInterval(() => {
  runCentralSnmpCycle().catch((error) => console.error("Falha na coleta SNMP central", error));
}, CENTRAL_SNMP_POLL_MS);
setInterval(checkContractExpirations, CONTRACT_EXPIRY_CHECK_MS);
server.listen(PORT, HOST, printStartup);
