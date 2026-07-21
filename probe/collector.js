import { spawn } from "node:child_process";
import { appendFile, mkdir, readFile, rename, writeFile } from "node:fs/promises";
import os from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const DEFAULT_CONFIG = new URL("./config.json", import.meta.url);
const VERSION = "0.6.9";
const DEFAULT_QUEUE_MAX_BATCHES = 1000;
const HOST_METRICS_CACHE_MS = 60 * 1000;
const HOST_METRICS_TIMEOUT_MS = 7000;
const REQUEST_TIMEOUT_MS = 15000;
const LOOP_WATCHDOG_MS = 90 * 1000;
const PUBLIC_IP_ENDPOINTS = [
  "https://api.ipify.org",
  "https://ifconfig.me/ip",
  "https://icanhazip.com"
];
const handledUpdateRequests = new Set();
const CRITICAL_SERVICE_NAMES = [
  "apache2",
  "docker",
  "glpi-agent",
  "httpd",
  "mariadb",
  "mssql-server",
  "mysql",
  "nginx",
  "postgresql",
  "sshd",
  "zabbix-agent",
  "Docker",
  "MSSQLSERVER",
  "MySQL",
  "Spooler",
  "W3SVC",
  "WinRM"
];

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
  config.token = String(process.env.PROBE_TOKEN || config.token || "").trim();
  const required = ["serverUrl", "probeId", "token"];
  for (const key of required) {
    if (!config[key]) {
      throw new Error(key === "token" ? "Missing probe token. Set PROBE_TOKEN or config.token." : `Missing required config field: ${key}`);
    }
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

function withTimeout(promise, timeoutMs, message) {
  let timeoutId;
  const timeout = new Promise((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error(message)), timeoutMs);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timeoutId));
}

function runCommand(command, args, timeoutMs = 2500) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { shell: false });
    let stdout = "";
    let stderr = "";
    let finished = false;
    const timeout = setTimeout(() => {
      if (finished) return;
      finished = true;
      try {
        if (os.platform() === "win32") {
          spawn("taskkill.exe", ["/PID", String(child.pid), "/T", "/F"], { stdio: "ignore" }).unref();
        } else {
          child.kill("SIGKILL");
        }
      } catch {
        try { child.kill(); } catch {}
      }
      reject(new Error(`${command} timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("error", (error) => {
      clearTimeout(timeout);
      if (finished) return;
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

function installProcessGuards(config) {
  process.on("unhandledRejection", (error) => {
    console.error(`[${new Date().toISOString()}] Unhandled rejection: ${error?.stack || error?.message || error}`);
    process.exit(21);
  });
  process.on("uncaughtException", (error) => {
    console.error(`[${new Date().toISOString()}] Uncaught exception: ${error?.stack || error?.message || error}`);
    process.exit(22);
  });

  let lastProgressAt = Date.now();
  const touch = (label = "progress") => {
    lastProgressAt = Date.now();
    if (label) process.env.SERVERWATCH_PROBE_LAST_PROGRESS = label;
  };
  const watchdog = setInterval(() => {
    const staleMs = Date.now() - lastProgressAt;
    if (staleMs <= LOOP_WATCHDOG_MS) return;
    console.error(`[${new Date().toISOString()}] Probe loop watchdog exceeded ${Math.round(staleMs / 1000)}s for ${config.probeId}. Exiting for supervisor restart.`);
    process.exit(23);
  }, 30 * 1000);
  watchdog.unref?.();
  return touch;
}

function runPowerShell(command, timeoutMs = 2500) {
  return runCommand("powershell.exe", [
    "-NoProfile",
    "-ExecutionPolicy",
    "Bypass",
    "-Command",
    `[Console]::OutputEncoding=[System.Text.Encoding]::UTF8; $OutputEncoding=[System.Text.Encoding]::UTF8; ${command}`
  ], timeoutMs);
}

async function diskUsage() {
  try {
    if (os.platform() === "win32") {
      const output = await runPowerShell("$d=Get-CimInstance Win32_LogicalDisk -Filter \"DeviceID='C:'\"; if($d){[pscustomobject]@{mount=$d.DeviceID;totalBytes=[int64]$d.Size;freeBytes=[int64]$d.FreeSpace}|ConvertTo-Json -Compress}");
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

async function diskPartitions() {
  try {
    if (os.platform() === "win32") {
      const output = await runPowerShell("Get-CimInstance Win32_LogicalDisk -Filter \"DriveType=3\" | Select-Object DeviceID,VolumeName,FileSystem,Size,FreeSpace | ConvertTo-Json -Compress", 4000);
      const parsed = JSON.parse(output.trim() || "[]");
      const rows = Array.isArray(parsed) ? parsed : [parsed];
      return rows
        .map((row) => {
          const totalBytes = Number(row.Size || 0);
          const freeBytes = Number(row.FreeSpace || 0);
          if (!totalBytes) return null;
          const usedBytes = Math.max(0, totalBytes - freeBytes);
          return {
            mount: String(row.DeviceID || "").trim(),
            label: String(row.VolumeName || "").trim() || null,
            filesystem: String(row.FileSystem || "").trim() || null,
            totalBytes,
            freeBytes,
            usedBytes,
            usedPercent: Math.round((usedBytes / totalBytes) * 100)
          };
        })
        .filter(Boolean)
        .slice(0, 24);
    }

    const output = await runCommand("df", ["-kPT", "-x", "tmpfs", "-x", "devtmpfs", "-x", "squashfs"], 4000);
    return output
      .trim()
      .split(/\r?\n/)
      .slice(1)
      .map((line) => {
        const parts = line.split(/\s+/);
        if (parts.length < 7) return null;
        const totalBytes = Number(parts[2]) * 1024;
        const usedBytes = Number(parts[3]) * 1024;
        const freeBytes = Number(parts[4]) * 1024;
        if (!totalBytes) return null;
        return {
          filesystem: parts[1] || null,
          mount: parts.slice(6).join(" ") || parts[6] || null,
          totalBytes,
          usedBytes,
          freeBytes,
          usedPercent: Math.round((usedBytes / totalBytes) * 100)
        };
      })
      .filter(Boolean)
      .slice(0, 24);
  } catch {
    return [];
  }
}

function splitCommandLines(output) {
  return String(output || "").trim().split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
}

async function listeningPorts() {
  try {
    if (os.platform() === "win32") {
      const output = await runPowerShell("Get-NetTCPConnection -State Listen | Select-Object LocalAddress,LocalPort,OwningProcess | Sort-Object LocalPort -Unique | ConvertTo-Json -Compress", 4000);
      const parsed = JSON.parse(output.trim() || "[]");
      const rows = Array.isArray(parsed) ? parsed : [parsed];
      return rows
        .map((row) => ({
          protocol: "tcp",
          address: String(row.LocalAddress || "").trim() || null,
          port: Number(row.LocalPort),
          processId: Number(row.OwningProcess) || null
        }))
        .filter((row) => Number.isFinite(row.port) && row.port > 0)
        .slice(0, 64);
    }

    let output = "";
    try {
      output = await runCommand("ss", ["-ltnH"], 3500);
    } catch {
      output = await runCommand("netstat", ["-ltn"], 3500);
    }
    return splitCommandLines(output)
      .map((line) => {
        const parts = line.split(/\s+/);
        const endpoint = parts.find((part) => /:\d+$/.test(part));
        if (!endpoint) return null;
        const match = endpoint.match(/^(.*):(\d+)$/);
        if (!match) return null;
        return {
          protocol: "tcp",
          address: match[1].replace(/^\[|\]$/g, "") || null,
          port: Number(match[2])
        };
      })
      .filter((row) => row && Number.isFinite(row.port) && row.port > 0)
      .filter((row, index, rows) => rows.findIndex((item) => item.port === row.port && item.address === row.address) === index)
      .sort((a, b) => a.port - b.port)
      .slice(0, 64);
  } catch {
    return [];
  }
}

async function criticalServices() {
  try {
    if (os.platform() === "win32") {
      const names = CRITICAL_SERVICE_NAMES.map((name) => `'${name.replace(/'/g, "''")}'`).join(",");
      const output = await runPowerShell(`$names=@(${names}); Get-Service | Where-Object {$names -contains $_.Name -or $names -contains $_.DisplayName} | Select-Object Name,DisplayName,Status,StartType | ConvertTo-Json -Compress`, 4500);
      const parsed = JSON.parse(output.trim() || "[]");
      const rows = Array.isArray(parsed) ? parsed : [parsed];
      return rows
        .map((row) => ({
          name: String(row.Name || "").trim(),
          displayName: String(row.DisplayName || "").trim() || null,
          status: String(row.Status || "").trim() || null,
          startType: String(row.StartType || "").trim() || null
        }))
        .filter((row) => row.name)
        .slice(0, 32);
    }

    const output = await runCommand("systemctl", ["list-units", "--type=service", "--all", "--no-legend", "--no-pager"], 4500);
    const watched = new Set(CRITICAL_SERVICE_NAMES.map((name) => name.toLowerCase()));
    return splitCommandLines(output)
      .map((line) => {
        const parts = line.replace(/^●\s*/, "").split(/\s+/);
        const unit = parts[0] || "";
        const baseName = unit.replace(/\.service$/, "").toLowerCase();
        if (!watched.has(baseName)) return null;
        return {
          name: unit,
          displayName: unit.replace(/\.service$/, ""),
          load: parts[1] || null,
          active: parts[2] || null,
          status: parts[3] || null
        };
      })
      .filter(Boolean)
      .slice(0, 32);
  } catch {
    return [];
  }
}

async function topProcesses() {
  try {
    if (os.platform() === "win32") {
      const output = await runPowerShell("Get-Process | Sort-Object CPU -Descending | Select-Object -First 10 ProcessName,Id,CPU,WorkingSet64 | ConvertTo-Json -Compress", 4500);
      const parsed = JSON.parse(output.trim() || "[]");
      const rows = Array.isArray(parsed) ? parsed : [parsed];
      return rows
        .map((row) => ({
          name: String(row.ProcessName || "").trim(),
          processId: Number(row.Id) || null,
          cpuSeconds: Number(row.CPU) || null,
          memoryBytes: Number(row.WorkingSet64) || null
        }))
        .filter((row) => row.name)
        .slice(0, 10);
    }

    const output = await runCommand("ps", ["-eo", "pid,comm,pcpu,pmem,rss", "--sort=-pcpu"], 3500);
    return splitCommandLines(output)
      .slice(1, 11)
      .map((line) => {
        const parts = line.split(/\s+/);
        return {
          processId: Number(parts[0]) || null,
          name: parts[1] || "",
          cpuPercent: Number(parts[2]) || null,
          memoryPercent: Number(parts[3]) || null,
          memoryBytes: Number(parts[4]) ? Number(parts[4]) * 1024 : null
        };
      })
      .filter((row) => row.name);
  } catch {
    return [];
  }
}

async function criticalEvents() {
  try {
    if (os.platform() === "win32") {
      const output = await runPowerShell("Get-WinEvent -FilterHashtable @{LogName=@('System','Application');Level=@(1,2)} -MaxEvents 10 | Select-Object TimeCreated,ProviderName,Id,LevelDisplayName,Message | ConvertTo-Json -Compress", 6000);
      const parsed = JSON.parse(output.trim() || "[]");
      const rows = Array.isArray(parsed) ? parsed : [parsed];
      return rows
        .map((row) => ({
          createdAt: row.TimeCreated || null,
          source: String(row.ProviderName || "").trim() || null,
          eventId: Number(row.Id) || null,
          level: String(row.LevelDisplayName || "").trim() || null,
          message: String(row.Message || "").replace(/\s+/g, " ").trim().slice(0, 500)
        }))
        .filter((row) => row.message || row.source)
        .slice(0, 10);
    }

    const output = await runCommand("journalctl", ["-p", "err..alert", "-n", "10", "--no-pager", "-o", "short-iso"], 5000);
    return splitCommandLines(output)
      .map((line) => {
        const match = line.match(/^(\S+\s+\S+)\s+\S+\s+([^:]+):\s*(.*)$/);
        return {
          createdAt: match?.[1] || null,
          source: match?.[2] || null,
          level: "error",
          message: (match?.[3] || line).slice(0, 500)
        };
      })
      .slice(0, 10);
  } catch {
    return [];
  }
}

async function virtualizationInventory() {
  try {
    if (os.platform() === "win32") {
      const output = await runPowerShell("if(Get-Command Get-VM -ErrorAction SilentlyContinue){Get-VM | Select-Object Name,State,Status,Uptime,MemoryAssigned,ProcessorCount | ConvertTo-Json -Compress}", 5000);
      if (!output.trim()) return [];
      const parsed = JSON.parse(output.trim() || "[]");
      const rows = Array.isArray(parsed) ? parsed : [parsed];
      return rows
        .map((row) => ({
          type: "vm",
          name: String(row.Name || "").trim(),
          state: String(row.State || row.Status || "").trim() || null,
          memoryBytes: Number(row.MemoryAssigned) || null,
          cpuCount: Number(row.ProcessorCount) || null
        }))
        .filter((row) => row.name)
        .slice(0, 64);
    }

    const rows = [];
    try {
      const output = await runCommand("qm", ["list"], 3500);
      rows.push(...splitCommandLines(output).slice(1).map((line) => {
        const parts = line.split(/\s+/);
        return { type: "vm", id: parts[0], name: parts[1], state: parts[2] || null, memoryMb: Number(parts[3]) || null };
      }));
    } catch {
      // qm exists only on Proxmox hosts.
    }
    try {
      const output = await runCommand("pct", ["list"], 3500);
      rows.push(...splitCommandLines(output).slice(1).map((line) => {
        const parts = line.split(/\s+/);
        return { type: "container", id: parts[0], state: parts[1] || null, name: parts[2] || null };
      }));
    } catch {
      // pct exists only on Proxmox hosts.
    }
    return rows.filter((row) => row.name || row.id).slice(0, 64);
  } catch {
    return [];
  }
}

async function proxmoxStorage() {
  if (os.platform() === "win32") return [];
  try {
    const output = await runCommand("pvesm", ["status"], 3500);
    return splitCommandLines(output)
      .slice(1)
      .map((line) => {
        const parts = line.split(/\s+/);
        if (parts.length < 6) return null;
        const totalBytes = Number(parts[3]) * 1024;
        const usedBytes = Number(parts[4]) * 1024;
        const availableBytes = Number(parts[5]) * 1024;
        return {
          name: parts[0] || null,
          type: parts[1] || null,
          status: parts[2] || null,
          totalBytes: Number.isFinite(totalBytes) ? totalBytes : null,
          usedBytes: Number.isFinite(usedBytes) ? usedBytes : null,
          availableBytes: Number.isFinite(availableBytes) ? availableBytes : null,
          usedPercent: Number.isFinite(totalBytes) && totalBytes > 0 ? Math.round((usedBytes / totalBytes) * 100) : null
        };
      })
      .filter((row) => row?.name)
      .slice(0, 32);
  } catch {
    return [];
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
    const output = await runPowerShell("Get-NetAdapter | Select-Object Name,InterfaceDescription,Status,LinkSpeed,MacAddress | ConvertTo-Json -Compress");
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
    diskPartitions: await diskPartitions(),
    networkInterfaces: await networkInterfaceMetrics(),
    listeningPorts: await listeningPorts(),
    services: await criticalServices(),
    topProcesses: await topProcesses(),
    criticalEvents: await criticalEvents(),
    virtualization: await virtualizationInventory(),
    proxmoxStorage: await proxmoxStorage(),
    system: {
      uptimeSeconds: Math.floor(os.uptime()),
      arch: os.arch(),
      release: os.release(),
      type: os.type()
    }
  };
}

let hostMetricsCache = null;
let hostMetricsCacheAt = 0;
let hostMetricsInFlight = null;

async function safeHostMetrics() {
  const now = Date.now();
  if (hostMetricsCache && now - hostMetricsCacheAt < HOST_METRICS_CACHE_MS) {
    return hostMetricsCache;
  }

  if (!hostMetricsInFlight) {
    hostMetricsInFlight = hostMetrics()
      .then((metrics) => {
        hostMetricsCache = metrics;
        hostMetricsCacheAt = Date.now();
        return metrics;
      })
      .catch((error) => {
        console.error(`[${new Date().toISOString()}] Host metrics failed: ${error.message}`);
        return hostMetricsCache;
      })
      .finally(() => {
        hostMetricsInFlight = null;
      });
  }

  try {
    return await withTimeout(hostMetricsInFlight, HOST_METRICS_TIMEOUT_MS, "Host metrics collection timed out.");
  } catch (error) {
    console.error(`[${new Date().toISOString()}] ${error.message}`);
    return hostMetricsCache;
  }
}

async function probeMetadata(config) {
  const addresses = localAddresses();
  const macAddresses = localMacAddresses();
  const metadata = {
    probeId: config.probeId,
    name: config.name || config.probeId,
    version: VERSION,
    platform: os.platform(),
    hostName: os.hostname(),
    primaryAddress: addresses[0] || "",
    addresses,
    primaryMac: macAddresses[0] || "",
    macAddresses
  };
  const metrics = await safeHostMetrics();
  if (metrics) metadata.hostMetrics = metrics;
  return metadata;
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
  if (leftNumber === null || rightNumber === null) return false;
  const mask = prefixLength === 0 ? 0 : (0xffffffff << (32 - prefixLength)) >>> 0;
  return (leftNumber & mask) === (rightNumber & mask);
}

function egressSubnetMatch(observedPublicIp, targetHost, configuredPrefixLength = null) {
  if (!observedPublicIp || !targetHost) return null;
  const prefixLength = Number(configuredPrefixLength);
  if (Number.isInteger(prefixLength) && prefixLength >= 1 && prefixLength <= 32) {
    return sameIpv4Subnet(observedPublicIp, targetHost, prefixLength) ? prefixLength : null;
  }
  for (const prefixLength of [30, 29, 28]) {
    if (sameIpv4Subnet(observedPublicIp, targetHost, prefixLength)) return prefixLength;
  }
  return null;
}

async function pingNetworkLink(target, timeoutMs) {
  const sampleCount = Math.max(1, Math.min(10, Number(target.sampleCount || 1)));
  const rawTargets = Array.isArray(target.targets) && target.targets.length
    ? target.targets
    : (Array.isArray(target.targetHosts) && target.targetHosts.length ? target.targetHosts : [target.targetHost]);
  const targets = [];
  const seen = new Set();
  for (const item of rawTargets) {
    const parsed = typeof item === "object" && item !== null
      ? {
          targetName: String(item.name || item.label || "").trim(),
          targetHost: String(item.host || item.targetHost || "").trim(),
          prefixLength: item.prefixLength ?? item.prefix_length ?? null
        }
      : {
          targetName: "",
          targetHost: String(item || "").trim(),
          prefixLength: null
        };
    if (!parsed.targetHost || seen.has(parsed.targetHost)) continue;
    seen.add(parsed.targetHost);
    targets.push(parsed);
  }
  const targetHosts = targets.map((item) => item.targetHost);
  const observedPublicIp = String(target.observedPublicIp || "").trim();
  const targetResults = [];
  for (const { targetHost, targetName, prefixLength } of targets) {
    const egressSubnetPrefix = egressSubnetMatch(observedPublicIp, targetHost, prefixLength);
    const samples = [];
    for (let index = 0; index < sampleCount; index += 1) {
      samples.push(await pingHost(targetHost, timeoutMs));
    }
    const successful = samples.filter((sample) => sample.online);
    const latencies = successful
      .map((sample) => sample.latencyMs)
      .filter((value) => Number.isFinite(Number(value)))
      .map(Number);
    const averageLatency = latencies.length
      ? Math.round(latencies.reduce((sum, value) => sum + value, 0) / latencies.length)
      : null;
    targetResults.push({
      targetHost,
      targetName,
      prefixLength: prefixLength || null,
      online: successful.length > 0,
      egressActive: Boolean(observedPublicIp && observedPublicIp === targetHost),
      egressSubnetActive: Boolean(egressSubnetPrefix),
      egressSubnetPrefix,
      latencyMs: averageLatency,
      packetLossPercent: Math.round(((sampleCount - successful.length) / sampleCount) * 1000) / 10,
      error: successful.length > 0 ? null : samples.find((sample) => sample.error)?.error || "Sem resposta ao ping."
    });
  }
  const successful = targetResults.filter((sample) => sample.online);
  successful.sort((left, right) => Number(left.latencyMs ?? 999999) - Number(right.latencyMs ?? 999999));
  const egressActive = targetResults.find((sample) => sample.egressActive) || null;
  const egressSubnetActive = targetResults.find((sample) => sample.egressSubnetActive) || null;
  const active = egressActive || egressSubnetActive || successful[0] || null;
  const activeDetection = egressActive
    ? "egress_ip"
    : egressSubnetActive
    ? "egress_subnet"
    : successful.length === 1
    ? "single_reachable"
    : successful.length > 1
    ? "ping_best"
    : "";
  const latencies = successful
    .map((sample) => sample.latencyMs)
    .filter((value) => Number.isFinite(Number(value)))
    .map(Number);
  const jitter = targetResults.length === 1 && latencies.length > 1
    ? Math.round(
        latencies
          .slice(1)
          .reduce((sum, value, index) => sum + Math.abs(value - latencies[index]), 0) /
          (latencies.length - 1)
      )
    : null;
  const firstError = targetResults.find((sample) => sample.error)?.error || null;
  return {
    linkId: target.id,
    targetHost: target.targetHost,
    targetHosts,
    targets,
    activeTargetHost: active?.targetHost || null,
    activeTargetName: active?.targetName || "",
    activeDetection,
    observedPublicIp: observedPublicIp || null,
    targetResults,
    online: successful.length > 0,
    latencyMs: active?.latencyMs ?? null,
    packetLossPercent: successful.length > 0 ? 0 : 100,
    jitterMs: jitter,
    error: successful.length > 0 ? null : firstError || "Sem resposta ao ping.",
    checkedAt: new Date().toISOString()
  };
}

async function detectPublicIp(timeoutMs) {
  const timeout = Math.max(1500, Math.min(5000, Number(timeoutMs || 2500)));
  for (const endpoint of PUBLIC_IP_ENDPOINTS) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);
    try {
      const response = await fetch(endpoint, {
        signal: controller.signal,
        headers: { "User-Agent": `ServerWatchProbe/${VERSION}` }
      });
      if (!response.ok) continue;
      const body = (await response.text()).trim();
      const match = body.match(/[a-fA-F0-9:.]+/);
      if (match?.[0]) return match[0];
    } catch {
      // Try the next endpoint; link monitoring can still fall back to ping.
    } finally {
      clearTimeout(timeoutId);
    }
  }
  return null;
}

async function requestJson(config, path, options = {}) {
  const { timeoutMs = REQUEST_TIMEOUT_MS, headers = {}, ...fetchOptions } = options;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  let response;
  try {
    response = await fetch(`${config.serverUrl}${path}`, {
      ...fetchOptions,
      signal: controller.signal,
      headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.token}`,
      "X-ServerWatch-Probe-Token": config.token,
        ...headers
      }
    });
  } catch (error) {
    if (error.name === "AbortError") {
      throw new Error(`Timeout ao conectar no ServerWatch apos ${Math.round(timeoutMs / 1000)}s.`);
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }

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
      .filter((entry) => (Array.isArray(entry.results) && entry.results.length) || (Array.isArray(entry.networkResults) && entry.networkResults.length));
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

async function queueResults(config, results, reason, networkResults = []) {
  if (!results.length && !networkResults.length) return;
  await mkdir(dirname(config.queuePath), { recursive: true });
  const entry = {
    createdAt: new Date().toISOString(),
    reason: String(reason || "Falha ao enviar resultados."),
    results,
    networkResults
  };
  await appendFile(config.queuePath, `${JSON.stringify(entry)}\n`, "utf8");

  const entries = await readQueue(config);
  if (entries.length > config.queueMaxBatches) {
    const trimmed = entries.slice(entries.length - config.queueMaxBatches);
    await writeQueue(config, trimmed);
    console.warn(`Queue limit reached. Dropped ${entries.length - trimmed.length} old batch(es).`);
  }
  console.warn(`Queued ${results.length} server result(s) and ${networkResults.length} network result(s) locally at ${config.queuePath}`);
}

async function flushQueue(config) {
  const entries = await readQueue(config);
  if (!entries.length) return 0;

  let sentResults = 0;
  for (let index = 0; index < entries.length; index += 1) {
    const entry = entries[index];
    try {
      await sendResults(config, entry.results || [], entry.networkResults || []);
      sentResults += (entry.results || []).length + (entry.networkResults || []).length;
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
    macAddresses: JSON.stringify(metadata.macAddresses)
  });
  return requestJson(config, `/api/probe/targets?${params.toString()}`);
}

async function sendResults(config, results, networkResults = []) {
  if (!results.length && !networkResults.length) return;
  const metadata = await probeMetadata(config);
  await requestJson(config, "/api/probe/results", {
    method: "POST",
    body: JSON.stringify({
      ...metadata,
      results,
      networkResults
    })
  });
}

function shellQuote(value) {
  return `'${String(value || "").replaceAll("'", "'\"'\"'")}'`;
}

async function reportUpdateStatus(config, request, status, error = null) {
  await requestJson(config, "/api/probe/update-status", {
    method: "POST",
    body: JSON.stringify({
      probeId: config.probeId,
      requestId: request.id,
      status,
      error
    })
  });
}

function spawnDetached(command, args) {
  const child = spawn(command, args, {
    detached: true,
    stdio: "ignore"
  });
  child.unref();
}

async function downloadToFile(config, urlPath, destination) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 5 * 60 * 1000);
  try {
    const response = await fetch(`${config.serverUrl}${urlPath}`, {
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${config.token}`,
        "X-ServerWatch-Probe-Token": config.token
      }
    });
    if (!response.ok) throw new Error(`Download retornou HTTP ${response.status}`);
    const buffer = Buffer.from(await response.arrayBuffer());
    await writeFile(destination, buffer);
  } finally {
    clearTimeout(timeoutId);
  }
}

async function handleLinuxUpdateRequest(config, request) {
  const installCommand = [
    `curl -fsSL ${shellQuote(`${config.serverUrl}/downloads/probe/linux-installer`)}`,
    "|",
    "bash -s -- --repair",
    "--server-url",
    shellQuote(config.serverUrl),
    "--probe-id",
    shellQuote(config.probeId),
    "--token",
    shellQuote(config.token),
    "--name",
    shellQuote(config.name || config.probeId)
  ].join(" ");
  const unitName = `serverwatch-probe-update-${String(request.id).replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 24)}`;
  await reportUpdateStatus(config, request, "running");

  try {
    spawnDetached("systemd-run", [
      "--unit",
      unitName,
      "--description",
      "ServerWatch Probe Collector update",
      "/usr/bin/env",
      "bash",
      "-lc",
      installCommand
    ]);
    console.log(`Scheduled probe update ${request.id} to ${request.targetVersion || "latest"}`);
  } catch (error) {
    await reportUpdateStatus(config, request, "failed", error.message);
  }
}

async function handleWindowsUpdateRequest(config, request) {
  await reportUpdateStatus(config, request, "running");
  try {
    const installDir = dirname(fileURLToPath(import.meta.url));
    const installerPath = resolve(installDir, "Install-Probe-Headless.ps1");
    await downloadToFile(config, "/downloads/probe/windows-ps1-installer", installerPath);
    const updateTaskName = `ServerWatch Probe Collector Update`;
    const escapedInstaller = installerPath.replace(/'/g, "''");
    const escapedTaskName = updateTaskName.replace(/'/g, "''");
    const psCmd = [
      `$taskName = '${escapedTaskName}'`,
      `$script = '${escapedInstaller}'`,
      `$execute = Join-Path $env:SystemRoot 'System32\\WindowsPowerShell\\v1.0\\powershell.exe'`,
      `$argument = '-NoProfile -ExecutionPolicy Bypass -File "' + $script + '" -Update'`,
      `$action = New-ScheduledTaskAction -Execute $execute -Argument $argument`,
      `$trigger = New-ScheduledTaskTrigger -Once -At (Get-Date).AddSeconds(20)`,
      `$principal = New-ScheduledTaskPrincipal -UserId 'SYSTEM' -RunLevel Highest`,
      `$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -ExecutionTimeLimit (New-TimeSpan -Minutes 20)`,
      `Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Principal $principal -Settings $settings -Force | Out-Null`,
      `Start-ScheduledTask -TaskName $taskName`
    ].join("; ");
    spawnDetached("powershell.exe", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-WindowStyle", "Hidden", "-Command", psCmd]);
    console.log(`Scheduled probe update ${request.id} to ${request.targetVersion || "latest"}`);
  } catch (error) {
    await reportUpdateStatus(config, request, "failed", error.message);
  }
}

async function handleUpdateRequest(config, request) {
  if (!request?.id || handledUpdateRequests.has(request.id)) return;
  handledUpdateRequests.add(request.id);

  const platform = os.platform();
  if (platform === "linux") {
    await handleLinuxUpdateRequest(config, request);
    return;
  }

  if (platform === "win32") {
    await handleWindowsUpdateRequest(config, request);
    return;
  }

  await reportUpdateStatus(config, request, "unsupported", "Atualizacao remota automatica disponivel apenas para Linux e Windows.");
}

async function runLoop(config) {
  const touchWatchdog = installProcessGuards(config);
  const nextChecks = new Map();
  const nextNetworkChecks = new Map();
  let cachedTargets = [];
  let cachedNetworkLinks = [];
  let offlineSince = null;
  console.log(`ServerWatch Probe ${VERSION} started as ${config.probeId}`);
  for (;;) {
    touchWatchdog("loop-start");
    try {
      const payload = await getTargets(config);
      touchWatchdog("targets");
      cachedTargets = Array.isArray(payload.targets) ? payload.targets : [];
      cachedNetworkLinks = Array.isArray(payload.networkLinks) ? payload.networkLinks : [];
      if (payload.updateRequest) {
        try {
          await handleUpdateRequest(config, payload.updateRequest);
        } catch (error) {
          console.error(`[${new Date().toISOString()}] Update request failed: ${error.message}`);
        }
      }
      if (offlineSince) {
        const offlineMs = Date.now() - offlineSince.getTime();
        console.log(`ServerWatch connection restored after ${Math.round(offlineMs / 1000)}s`);
        offlineSince = null;
      }

      try {
        const flushed = await flushQueue(config);
        if (flushed) console.log(`Flushed ${flushed} queued result(s)`);
        touchWatchdog("queue");
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
        touchWatchdog("target-check");
      }
      const dueNetworkLinks = cachedNetworkLinks.filter((target) => {
        const dueAt = nextNetworkChecks.get(target.id) || 0;
        return target.forceCheck || dueAt <= now;
      });
      const networkResults = [];
      const observedPublicIp = dueNetworkLinks.length ? await detectPublicIp(Math.min(config.timeoutMs, 3000)) : null;
      for (const target of dueNetworkLinks) {
        networkResults.push(await pingNetworkLink({ ...target, observedPublicIp }, config.timeoutMs));
        nextNetworkChecks.set(target.id, Date.now() + Math.max(10, target.checkInterval || 10) * 1000);
        touchWatchdog("network-check");
      }
      try {
        await sendResults(config, results, networkResults);
        touchWatchdog("send");
        if (results.length || networkResults.length) {
          console.log(`Sent ${results.length} server result(s) and ${networkResults.length} network result(s)`);
        }
      } catch (error) {
        if (!offlineSince) offlineSince = new Date();
        await queueResults(config, results, error.message, networkResults);
        console.error(`[${new Date().toISOString()}] Send failed: ${error.message}`);
      }
    } catch (error) {
      if (!offlineSince) offlineSince = new Date();
      console.error(`[${new Date().toISOString()}] ${error.message}`);

      if (cachedTargets.length || cachedNetworkLinks.length) {
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
          touchWatchdog("fallback-target-check");
        }
        const dueNetworkLinks = cachedNetworkLinks.filter((target) => {
          const dueAt = nextNetworkChecks.get(target.id) || 0;
          return target.forceCheck || dueAt <= now;
        });
        const networkResults = [];
        const observedPublicIp = dueNetworkLinks.length ? await detectPublicIp(Math.min(config.timeoutMs, 3000)) : null;
        for (const target of dueNetworkLinks) {
          networkResults.push(await pingNetworkLink({ ...target, observedPublicIp }, config.timeoutMs));
          nextNetworkChecks.set(target.id, Date.now() + Math.max(10, target.checkInterval || 10) * 1000);
          touchWatchdog("fallback-network-check");
        }
        await queueResults(config, results, error.message, networkResults);
        touchWatchdog("fallback-queue");
      }
    }
    touchWatchdog("loop-end");
    await new Promise((resolve) => setTimeout(resolve, Math.min(10, Math.max(3, config.intervalSeconds)) * 1000));
  }
}

const config = await loadConfig();
await runLoop(config);
