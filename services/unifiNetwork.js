import https from "node:https";
import { URL } from "node:url";

const MAX_RESPONSE_BYTES = 8 * 1024 * 1024;
const REQUEST_TIMEOUT_MS = 20_000;

function normalizedFingerprint(value) {
  return String(value || "").replace(/[^a-f0-9]/gi, "").toUpperCase();
}

function unifiRequest(config, path) {
  return new Promise((resolve, reject) => {
    let target;
    try {
      target = new URL(`${config.baseUrl}${config.apiBasePath || "/proxy/network/integration"}${path}`);
    } catch {
      reject(new Error("URL do UniFi invalida."));
      return;
    }

    const expectedFingerprint = normalizedFingerprint(config.tlsFingerprint);
    const req = https.request(
      {
        hostname: target.hostname,
        port: target.port || 443,
        path: `${target.pathname}${target.search}`,
        method: "GET",
        headers: {
          "X-API-KEY": config.apiKey,
          Accept: "application/json"
        },
        rejectUnauthorized: !expectedFingerprint,
        checkServerIdentity: expectedFingerprint
          ? (_hostname, cert) => {
              const actual = normalizedFingerprint(cert.fingerprint256);
              if (actual !== expectedFingerprint) {
                return new Error("Certificado do UniFi nao corresponde ao fingerprint configurado.");
              }
              return undefined;
            }
          : undefined
      },
      (res) => {
        let raw = "";
        let size = 0;
        res.setEncoding("utf8");
        res.on("data", (chunk) => {
          size += Buffer.byteLength(chunk);
          if (size > MAX_RESPONSE_BYTES) {
            req.destroy(new Error("Resposta do UniFi excedeu o limite permitido."));
            return;
          }
          raw += chunk;
        });
        res.on("end", () => {
          if (res.statusCode < 200 || res.statusCode >= 300) {
            let message = "";
            try {
              const body = JSON.parse(raw);
              message = body?.error?.message || body?.message || "";
            } catch {
              message = raw.slice(0, 160);
            }
            const suffix = message ? `: ${message}` : "";
            if (res.statusCode === 401 || res.statusCode === 403) {
              reject(new Error(`UniFi nao autorizou a coleta em ${path}${suffix}`));
              return;
            }
            reject(new Error(`UniFi respondeu ${res.statusCode} em ${path}${suffix}`));
            return;
          }
          try {
            resolve(JSON.parse(raw));
          } catch {
            reject(new Error(`Resposta invalida do UniFi em ${path}`));
          }
        });
      }
    );
    req.setTimeout(REQUEST_TIMEOUT_MS, () => req.destroy(new Error(`Timeout ao consultar o UniFi em ${path}`)));
    req.on("error", reject);
    req.end();
  });
}

async function unifiGet(config, path) {
  return unifiRequest(config, path);
}

async function fetchPaged(config, path, limit = 200) {
  const items = [];
  let offset = 0;
  while (true) {
    const separator = path.includes("?") ? "&" : "?";
    const page = await unifiGet(config, `${path}${separator}offset=${offset}&limit=${limit}`);
    const data = Array.isArray(page?.data) ? page.data : Array.isArray(page?.items) ? page.items : Array.isArray(page) ? page : [];
    items.push(...data);
    const total = Number(page?.totalCount ?? page?.count ?? data.length);
    offset += data.length;
    if (!data.length || offset >= total) break;
  }
  return items;
}

function deviceType(device) {
  const features = Array.isArray(device?.features) ? device.features : [];
  if (features.includes("accessPoint")) return "access_point";
  if (features.includes("switching")) return "switch";
  if (features.includes("gateway")) return "gateway";
  return "device";
}

export function unifiDeviceStatus(device) {
  const state = String(device?.state || "").toUpperCase();
  if (state === "ONLINE") return device?.firmwareUpdatable ? "attention" : "online";
  if (["UPGRADING", "PROVISIONING", "ADOPTING"].includes(state)) return "attention";
  if (["OFFLINE", "DISCONNECTED", "FAILED"].includes(state)) return "offline";
  return "unknown";
}

function normalizeDevice(site, device, statistics = null) {
  return {
    id: String(device.id || device.macAddress || ""),
    siteId: String(site.id || ""),
    mac: String(device.macAddress || "").toLowerCase(),
    ipAddress: device.ipAddress || null,
    name: String(device.name || device.model || "Dispositivo UniFi").trim(),
    model: device.model || null,
    type: deviceType(device),
    state: String(device.state || "UNKNOWN").toUpperCase(),
    status: unifiDeviceStatus(device),
    supported: device.supported !== false,
    firmwareVersion: device.firmwareVersion || null,
    firmwareUpdatable: device.firmwareUpdatable === true,
    features: Array.isArray(device.features) ? device.features : [],
    uptimeSeconds: Number(statistics?.uptimeSec) || null,
    lastHeartbeatAt: statistics?.lastHeartbeatAt || null,
    cpuUtilizationPct: Number.isFinite(Number(statistics?.cpuUtilizationPct)) ? Number(statistics.cpuUtilizationPct) : null,
    memoryUtilizationPct: Number.isFinite(Number(statistics?.memoryUtilizationPct)) ? Number(statistics.memoryUtilizationPct) : null,
    txRateBps: Number(statistics?.uplink?.txRateBps) || null,
    rxRateBps: Number(statistics?.uplink?.rxRateBps) || null,
    radios: Array.isArray(statistics?.interfaces?.radios) ? statistics.interfaces.radios : []
  };
}

async function mapWithConcurrency(items, concurrency, mapper) {
  const output = new Array(items.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor++;
      output[index] = await mapper(items[index], index);
    }
  });
  await Promise.all(workers);
  return output;
}

export async function fetchUnifiNetworkSummary(config) {
  const sitesRaw = await fetchPaged(config, "/v1/sites");
  const sites = await mapWithConcurrency(sitesRaw, 4, async (site) => {
    const siteId = encodeURIComponent(site.id);
    const devicesRaw = await fetchPaged(config, `/v1/sites/${siteId}/devices`);
    const clientPage = await unifiGet(config, `/v1/sites/${siteId}/clients?offset=0&limit=1`).catch(() => ({ totalCount: 0 }));
    const devices = await mapWithConcurrency(devicesRaw, 8, async (device) => {
      const statistics = await unifiGet(
        config,
        `/v1/sites/${siteId}/devices/${encodeURIComponent(device.id)}/statistics/latest`
      ).catch(() => null);
      return normalizeDevice(site, device, statistics);
    });
    const counts = devices.reduce(
      (acc, device) => {
        acc[device.status] = (acc[device.status] || 0) + 1;
        return acc;
      },
      { online: 0, attention: 0, offline: 0, unknown: 0 }
    );
    return {
      id: String(site.id || ""),
      internalReference: String(site.internalReference || ""),
      name: String(site.name || site.internalReference || "Site UniFi").trim(),
      clientCount: Number(clientPage?.totalCount ?? clientPage?.count ?? 0) || 0,
      deviceCount: devices.length,
      counts,
      status: counts.offline ? "offline" : counts.attention || counts.unknown ? "attention" : devices.length ? "online" : "unknown",
      devices
    };
  });

  return {
    configured: true,
    fetchedAt: new Date().toISOString(),
    error: null,
    sites
  };
}

export function emptyUnifiNetworkState() {
  return {
    configured: false,
    fetchedAt: null,
    error: null,
    sites: []
  };
}
