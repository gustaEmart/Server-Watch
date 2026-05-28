import { spawn } from "node:child_process";
import { appendFile, mkdir, readFile, rename, writeFile } from "node:fs/promises";
import os from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const DEFAULT_CONFIG = new URL("./config.json", import.meta.url);
const VERSION = "0.5.0";
const DEFAULT_QUEUE_MAX_BATCHES = 1000;

function argValue(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : null;
}

function configPathToFilePath(value) {
  if (value instanceof URL) return fileURLToPath(value);
  const raw = String(value || "");
  if (raw.startsWith("file:")) return fileURLToPath(new URL(raw));
  return resolve(raw);
}

function positiveInteger(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? Math.floor(number) : fallback;
}

async function loadConfig() {
  const configPath = argValue("--config") || process.env.SERVERWATCH_PROBE_CONFIG || DEFAULT_CONFIG;
  const raw = (await readFile(configPath, "utf8")).replace(/^\uFEFF/, "");
  const config = JSON.parse(raw);
  const required = ["serverUrl", "probeId", "token"];
  for (const key of required) {
    if (!config[key]) throw new Error(`Missing required config field: ${key}`);
  }
  return {
    intervalSeconds: 10,
    timeoutMs: 2500,
    name: config.probeId,
    ...config,
    serverUrl: String(config.serverUrl).replace(/\/+$/, ""),
    queuePath:
      config.queuePath || process.env.SERVERWATCH_PROBE_QUEUE ||
      resolve(dirname(configPathToFilePath(configPath)), "queue.jsonl"),
    queueMaxBatches: Math.max(10, positiveInteger(config.queueMaxBatches, DEFAULT_QUEUE_MAX_BATCHES))
  };
}

function buildPingArgs(hostname, timeoutMs) {
  if (os.platform() === "win32") {
    return ["-n", "1", "-w", String(timeoutMs), hostname];
  }
  return ["-c", "1", "-W", String(Math.max(1, Math.ceil(timeoutMs / 1000))), hostname];
}

function pingCommand() {
  if (os.platform() === "win32") {
    return `${process.env.SystemRoot || "C:\\Windows"}\\System32\\ping.exe`;
  }
  return "ping";
}

function localInterfaces() {
  return Object.entries(os.networkInterfaces())
    .flatMap(([name, items]) => (items || []).map((item) => ({ name, ...item })))
    .filter((item) => item.family === "IPv4" && !item.internal && !item.address.startsWith("169.254."));
}

function localAddresses() {
  return localInterfaces()
    .map((item) => item.address);
}

function localMacAddresses() {
  return [...new Set(
    localInterfaces()
      .map((item) => String(item.mac || "").toLowerCase())
      .filter((mac) => mac && mac !== "00:00:00:00:00:00")
  )];
}

function cpuSnapshot() {
  return os.cpus().map((cpu) => {
    const times = cpu.times;
    const idle = times.idle;
    const total = Object.values(times).reduce((sum, value) => sum + value, 0);
    return { idle, total };
  });
}

function cpuUsageFromSnapshots(start, end) {
  const usages = end.map((item, index) => {
    const previous = start[index];
    if (!previous) return null;
    const idle = item.idle - previous.idle;
    const total = item.total - previous.total;
    if (total <= 0) return null;
    return Math.max(0, Math.min(100, (1 - idle / total) * 100));
  }).filter((value) => value !== null);
  if (!usages.length) return null;
  return Math.round(usages.reduce((sum, value) => sum + value, 0) / usages.length);
}

function runCommand(command, args, timeoutMs = 2500) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { shell: false });
    let stdout = "";
    let stderr = "";
    let finished = false;
    const timeout = setTimeout(() => {
      if (!finished) child.kill();
    }, timeoutMs);

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("error", (error) => {
      clearTimeout(timeout);
      finished = true;
      reject(error);
    });
    child.on("close", (code) => {
      clearTimeout(timeout);
      if (finished) return;
      finished = true;
      if (code === 0) resolve(stdout);
      else reject(new Error(stderr.trim() || `${command} exited with ${code}`));
    });
  });
}

async function diskUsage() {
  try {
    if (os.platform() === "win32") {
      const output = await runCommand("powershell.exe", [
        "-NoProfile",
        "-ExecutionPolicy",
        "Bypass",
        "-Command",
        "$d=Get-CimInstance Win32_LogicalDisk -Filter \"DeviceID='C:'\"; if($d){[pscustomobject]@{mount=$d.DeviceID;totalBytes=[int64]$d.Size;freeBytes=[int64]$d.FreeSpace}|ConvertTo-Json -Compress}"
      ]);
      const parsed = JSON.parse(output.trim());
      const totalBytes = Number(parsed.totalBytes || 0);
      const freeBytes = Number(parsed.freeBytes || 0);
      return totalBytes > 0
        ? {
            mount: parsed.mount || "C:",
            totalBytes,
            freeBytes,
            usedBytes: totalBytes - freeBytes,
            usedPercent: Math.round(((totalBytes - freeBytes) / totalBytes) * 100)
          }
        : null;
    }

    const output = await runCommand("df", ["-kP", "/"]);
    const line = output.trim().split(/\r?\n/)[1];
    if (!line) return null;
    const parts = line.split(/\s+/);
    const totalBytes = Number(parts[1]) * 1024;
    const usedBytes = Number(parts[2]) * 1024;
    const freeBytes = Number(parts[3]) * 1024;
    return totalBytes > 0
      ? {
          mount: parts[5] || "/",
          totalBytes,
          usedBytes,
          freeBytes,
          usedPercent: Math.round((usedBytes / totalBytes) * 100)
        }
      : null;
  } catch (error) {
    return null;
  }
}

function parseLinkSpeedMbps(value) {
  const text = String(value || "").trim();
  if (!text) return null;
  const number = Number(text.replace(",", ".").match(/[\d.]+/)?.[0]);
  if (!Number.isFinite(number)) return null;
  if (/gbps|gbit|g\b/i.test(text)) return Math.round(number * 1000);
  if (/kbps|kbit|k\b/i.test(text)) return Math.max(1, Math.round(number / 1000));
  return Math.round(number);
}

async function windowsAdapterDetails() {
  if (os.platform() !== "win32") return new Map();
  try {
    const output = await runCommand("powershell.exe", [
      "-NoProfile",
      "-ExecutionPolicy",
      "Bypass",
      "-Command",
      "Get-NetAdapter | Select-Object Name,InterfaceDescription,Status,LinkSpeed,MacAddress | ConvertTo-Json -Compress"
    ]);
    const parsed = JSON.parse(output.trim() || "[]");
    const rows = Array.isArray(parsed) ? parsed : [parsed];
    const byName = new Map();
    for (const row of rows) {
      const normalized = {
        description: String(row.InterfaceDescription || "").trim() || null,
        status: String(row.Status || "").trim() || null,
        speedMbps: parseLinkSpeedMbps(row.LinkSpeed),
        mac: String(row.MacAddress || "").toLowerCase().replace(/-/g, ":")
      };
      if (row.Name) byName.set(String(row.Name).toLowerCase(), normalized);
      if (normalized.mac) byName.set(normalized.mac, normalized);
    }
    return byName;
  } catch {
    return new Map();
  }
}

async function linuxInterfaceDetails(name) {
  if (os.platform() === "win32") return {};
  const readSys = async (file) => {
    try {
      return (await readFile(`/sys/class/net/${name}/${file}`, "utf8")).trim();
    } catch {
      return "";
    }
  };
  const [operstate, speed] = await Promise.all([readSys("operstate"), readSys("speed")]);
  const speedNumber = Number(speed);
  return {
    status: operstate || null,
    speedMbps: Number.isFinite(speedNumber) && speedNumber > 0 ? speedNumber : null
  };
}

async function networkInterfaceMetrics() {
  const windowsDetails = await windowsAdapterDetails();
  const entries = await Promise.all(
    Object.entries(os.networkInterfaces()).map(async ([name, items]) => {
      const addresses = (items || [])
        .filter((item) => !item.internal && !item.address.startsWith("169.254."))
        .map((item) => ({
          family: item.family,
          address: item.address,
          netmask: item.netmask || null,
          cidr: item.cidr || null
        }));
      const mac = String((items || []).find((item) => item.mac && item.mac !== "00:00:00:00:00:00")?.mac || "")
        .toLowerCase();
      const extra = os.platform() === "win32"
        ? windowsDetails.get(name.toLowerCase()) || windowsDetails.get(mac) || {}
        : await linuxInterfaceDetails(name);
      return {
        name,
        description: extra.description || null,
        status: extra.status || null,
        speedMbps: extra.speedMbps || null,
        mac: mac || null,
        addresses
      };
    })
  );

  return entries
    .filter((entry) => entry.addresses.length || entry.mac)
    .sort((left, right) => Number(Boolean(right.addresses.length)) - Number(Boolean(left.addresses.length)) || left.name.localeCompare(right.name))
    .slice(0, 24);
}

async function hostMetrics() {
  const start = cpuSnapshot();
  await new Promise((resolve) => setTimeout(resolve, 120));
  const end = cpuSnapshot();
  const totalMemoryBytes = os.totalmem();
  const freeMemoryBytes = os.freemem();
  const usedMemoryBytes = Math.max(0, totalMemoryBytes - freeMemoryBytes);
  return {
    collectedAt: new Date().toISOString(),
    cpu: {
      usagePercent: cpuUsageFromSnapshots(start, end),
      cores: os.cpus().length,
      model: os.cpus()[0]?.model || null,
      loadAverage: os.loadavg()
    },
    memory: {
      totalBytes: totalMemoryBytes,
      freeBytes: freeMemoryBytes,
      usedBytes: usedMemoryBytes,
      usedPercent: totalMemoryBytes > 0 ? Math.round((usedMemoryBytes / totalMemoryBytes) * 100) : null
    },
    disk: await diskUsage(),
    networkInterfaces: await networkInterfaceMetrics(),
    system: {
      uptimeSeconds: Math.floor(os.uptime()),
      arch: os.arch(),
      release: os.release(),
      type: os.type()
    }
  };
}

async function probeMetadata(config) {
  const addresses = localAddresses();
  const macAddresses = localMacAddresses();
  return {
    probeId: config.probeId,
    name: config.name || config.probeId,
    version: VERSION,
    platform: os.platform(),
    hostName: os.hostname(),
    primaryAddress: addresses[0] || "",
    addresses,
    primaryMac: macAddresses[0] || "",
    macAddresses,
    hostMetrics: await hostMetrics()
  };
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
    [/unknown host/i, "Hostname nao encontrado."],
    [/100%\s*(?:loss|de\s+perda)/i, "Sem resposta ao ping."],
    [/(?:received|recebidos)\s*=\s*0/i, "Sem resposta ao ping."]
  ];
  const match = checks.find(([pattern]) => pattern.test(output));
  return match ? match[1] : null;
}

function hasReply(output, latencyMs) {
  return (
    latencyMs !== null ||
    /\bttl[=\s]/i.test(output) ||
    /(?:received|recebidos)\s*=\s*[1-9]/i.test(output) ||
    /[1-9]\s+(?:received|recebidos)/i.test(output)
  );
}

function pingHost(hostname, timeoutMs) {
  return new Promise((resolve) => {
    const startedAt = Date.now();
    const child = spawn(pingCommand(), buildPingArgs(hostname, timeoutMs), { shell: false });
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
      resolve({ online: false, latencyMs: null, error: error.message, checkedAt: new Date().toISOString() });
    });
    child.on("close", (code) => {
      clearTimeout(timeout);
      if (finished) return;
      finished = true;
      const latencyMs = parseLatency(output);
      const reason = failureReason(output);
      const online = code === 0 && !reason && hasReply(output, latencyMs);
      resolve({
        online,
        latencyMs: online ? (latencyMs === null || latencyMs === undefined ? Date.now() - startedAt : latencyMs) : null,
        error: online ? null : reason || "Sem resposta ao ping.",
        checkedAt: new Date().toISOString()
      });
    });
  });
}

async function requestJson(config, path, options = {}) {
  const response = await fetch(`${config.serverUrl}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.token}`,
      "X-ServerWatch-Probe-Token": config.token,
      ...(options.headers || {})
    }
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || `HTTP ${response.status}`);
  return body;
}

async function readQueue(config) {
  try {
    const raw = await readFile(config.queuePath, "utf8");
    return raw
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => JSON.parse(line))
      .filter((entry) => Array.isArray(entry.results) && entry.results.length);
  } catch (error) {
    if (error.code === "ENOENT") return [];
    console.error(`[${new Date().toISOString()}] Queue read failed: ${error.message}`);
    return [];
  }
}

async function writeQueue(config, entries) {
  await mkdir(dirname(config.queuePath), { recursive: true });
  const tmpPath = `${config.queuePath}.${process.pid}.tmp`;
  const body = entries.length ? `${entries.map((entry) => JSON.stringify(entry)).join("\n")}\n` : "";
  await writeFile(tmpPath, body, "utf8");
  await rename(tmpPath, config.queuePath);
}

async function queueResults(config, results, reason) {
  if (!results.length) return;
  await mkdir(dirname(config.queuePath), { recursive: true });
  const entry = {
    createdAt: new Date().toISOString(),
    reason: String(reason || "Falha ao enviar resultados."),
    results
  };
  await appendFile(config.queuePath, `${JSON.stringify(entry)}\n`, "utf8");

  const entries = await readQueue(config);
  if (entries.length > config.queueMaxBatches) {
    const trimmed = entries.slice(entries.length - config.queueMaxBatches);
    await writeQueue(config, trimmed);
    console.warn(`Queue limit reached. Dropped ${entries.length - trimmed.length} old batch(es).`);
  }
  console.warn(`Queued ${results.length} result(s) locally at ${config.queuePath}`);
}

async function flushQueue(config) {
  const entries = await readQueue(config);
  if (!entries.length) return 0;

  let sentResults = 0;
  for (let index = 0; index < entries.length; index += 1) {
    const entry = entries[index];
    try {
      await sendResults(config, entry.results);
      sentResults += entry.results.length;
    } catch (error) {
      await writeQueue(config, entries.slice(index));
      throw error;
    }
  }

  await writeQueue(config, []);
  return sentResults;
}

async function getTargets(config) {
  const metadata = await probeMetadata(config);
  const params = new URLSearchParams({
    probeId: metadata.probeId,
    name: metadata.name,
    version: metadata.version,
    hostName: metadata.hostName,
    primaryAddress: metadata.primaryAddress,
    addresses: JSON.stringify(metadata.addresses),
    platform: metadata.platform,
    primaryMac: metadata.primaryMac,
    macAddresses: JSON.stringify(metadata.macAddresses),
    hostMetrics: JSON.stringify(metadata.hostMetrics)
  });
  return requestJson(config, `/api/probe/targets?${params.toString()}`);
}

async function sendResults(config, results) {
  if (!results.length) return;
  const metadata = await probeMetadata(config);
  await requestJson(config, "/api/probe/results", {
    method: "POST",
    body: JSON.stringify({
      ...metadata,
      results
    })
  });
}

async function runLoop(config) {
  const nextChecks = new Map();
  let cachedTargets = [];
  let offlineSince = null;
  console.log(`ServerWatch Probe ${VERSION} started as ${config.probeId}`);
  for (;;) {
    try {
      const payload = await getTargets(config);
      cachedTargets = Array.isArray(payload.targets) ? payload.targets : [];
      if (offlineSince) {
        const offlineMs = Date.now() - offlineSince.getTime();
        console.log(`ServerWatch connection restored after ${Math.round(offlineMs / 1000)}s`);
        offlineSince = null;
      }

      try {
        const flushed = await flushQueue(config);
        if (flushed) console.log(`Flushed ${flushed} queued result(s)`);
      } catch (error) {
        if (!offlineSince) offlineSince = new Date();
        console.error(`[${new Date().toISOString()}] Queue flush failed: ${error.message}`);
      }

      const now = Date.now();
      const dueTargets = cachedTargets.filter((target) => {
        const dueAt = nextChecks.get(target.id) || 0;
        return target.forceCheck || dueAt <= now;
      });
      const results = [];
      for (const target of dueTargets) {
        const result = await pingHost(target.hostname, config.timeoutMs);
        results.push({
          serverId: target.id,
          hostname: target.hostname,
          ...result
        });
        nextChecks.set(target.id, Date.now() + Math.max(3, target.checkInterval || config.intervalSeconds) * 1000);
      }
      try {
        await sendResults(config, results);
        if (results.length) console.log(`Sent ${results.length} result(s)`);
      } catch (error) {
        if (!offlineSince) offlineSince = new Date();
        await queueResults(config, results, error.message);
        console.error(`[${new Date().toISOString()}] Send failed: ${error.message}`);
      }
    } catch (error) {
      if (!offlineSince) offlineSince = new Date();
      console.error(`[${new Date().toISOString()}] ${error.message}`);

      if (cachedTargets.length) {
        const now = Date.now();
        const dueTargets = cachedTargets.filter((target) => {
          const dueAt = nextChecks.get(target.id) || 0;
          return target.forceCheck || dueAt <= now;
        });
        const results = [];
        for (const target of dueTargets) {
          const result = await pingHost(target.hostname, config.timeoutMs);
          results.push({
            serverId: target.id,
            hostname: target.hostname,
            ...result
          });
          nextChecks.set(target.id, Date.now() + Math.max(3, target.checkInterval || config.intervalSeconds) * 1000);
        }
        await queueResults(config, results, error.message);
      }
    }
    await new Promise((resolve) => setTimeout(resolve, Math.max(3, config.intervalSeconds) * 1000));
  }
}

const config = await loadConfig();
await runLoop(config);
