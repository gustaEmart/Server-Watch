import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import os from "node:os";
import { snmpGet, snmpWalk } from "./snmp/client.js";
import { IF_MIB, vendorTemplate, detectVendorFromSysObjectId } from "./snmp/vendor-templates.js";

const DEFAULT_CONFIG = new URL("./config.json", import.meta.url);
const VERSION = "0.1.0";
const REQUEST_TIMEOUT_MS = 15000;
const LOOP_WATCHDOG_MS = 90 * 1000;
const SNMP_TIMEOUT_MS = 3000;
const GATEWAY_DETECT_EVERY_N_LOOPS = 10;

// ---------------------------------------------------------------------------
// Config / util — mesmos padroes de probe/collector.js
// ---------------------------------------------------------------------------

function argValue(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : null;
}

async function loadConfig() {
  const configPath = argValue("--config") || process.env.SERVERWATCH_NETWORK_PROBE_CONFIG || DEFAULT_CONFIG;
  const raw = (await readFile(configPath, "utf8")).replace(/^﻿/, "");
  const config = JSON.parse(raw);
  config.token = String(process.env.PROBE_TOKEN || config.token || "").trim();
  const required = ["serverUrl", "probeId", "token"];
  for (const key of required) {
    if (!config[key]) {
      throw new Error(key === "token" ? "Missing probe token. Set PROBE_TOKEN or config.token." : `Missing required config field: ${key}`);
    }
  }
  return {
    intervalSeconds: 60,
    timeoutMs: SNMP_TIMEOUT_MS,
    name: config.probeId,
    ...config,
    serverUrl: String(config.serverUrl).replace(/\/+$/, "")
  };
}

function runCommand(command, args, timeoutMs = 2500) {
  return new Promise((resolvePromise, reject) => {
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

    child.stdout.on("data", (chunk) => { stdout += chunk.toString(); });
    child.stderr.on("data", (chunk) => { stderr += chunk.toString(); });
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
      if (code === 0) resolvePromise(stdout);
      else reject(new Error(stderr.trim() || `${command} exited with ${code}`));
    });
  });
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

function installProcessGuards(config) {
  process.on("unhandledRejection", (error) => {
    console.error(`[${new Date().toISOString()}] Unhandled rejection: ${error?.stack || error?.message || error}`);
    process.exit(121);
  });
  process.on("uncaughtException", (error) => {
    console.error(`[${new Date().toISOString()}] Uncaught exception: ${error?.stack || error?.message || error}`);
    process.exit(122);
  });

  let lastProgressAt = Date.now();
  const touch = (label = "progress") => {
    lastProgressAt = Date.now();
    if (label) process.env.SERVERWATCH_NETWORK_PROBE_LAST_PROGRESS = label;
  };
  const watchdog = setInterval(() => {
    const staleMs = Date.now() - lastProgressAt;
    if (staleMs <= LOOP_WATCHDOG_MS) return;
    console.error(`[${new Date().toISOString()}] Network probe loop watchdog exceeded ${Math.round(staleMs / 1000)}s for ${config.probeId}. Exiting for supervisor restart.`);
    process.exit(123);
  }, 30 * 1000);
  watchdog.unref?.();
  return touch;
}

function localAddresses() {
  return Object.values(os.networkInterfaces())
    .flatMap((items) => items || [])
    .filter((item) => item.family === "IPv4" && !item.internal && !item.address.startsWith("169.254."))
    .map((item) => item.address);
}

// ---------------------------------------------------------------------------
// Deteccao do gateway padrao — o Mikrotik/FortiGate/pfSense quase sempre
// EH o gateway padrao da rede onde o probe esta instalado, entao isso cobre
// a maioria dos casos sem nenhuma configuracao manual.
// ---------------------------------------------------------------------------

async function detectDefaultGatewayLinux() {
  try {
    const output = await runCommand("ip", ["route", "show", "default"], 2500);
    const match = output.match(/default via (\d{1,3}(?:\.\d{1,3}){3})/);
    if (match) return match[1];
  } catch { /* tenta o fallback abaixo */ }
  try {
    const output = await runCommand("route", ["-n"], 2500);
    const line = output.split("\n").find((row) => row.trim().startsWith("0.0.0.0"));
    const match = line?.match(/^0\.0\.0\.0\s+(\d{1,3}(?:\.\d{1,3}){3})/);
    if (match) return match[1];
  } catch { /* sem gateway detectavel */ }
  return null;
}

async function detectDefaultGatewayWindows() {
  try {
    const output = await runPowerShell(
      "Get-NetRoute -DestinationPrefix 0.0.0.0/0 -ErrorAction SilentlyContinue | Sort-Object RouteMetric | Select-Object -First 1 -ExpandProperty NextHop"
    );
    const match = output.trim().match(/^(\d{1,3}(?:\.\d{1,3}){3})$/m);
    if (match) return match[1];
  } catch { /* tenta o fallback abaixo */ }
  try {
    const output = await runCommand("route", ["print", "-4"], 2500);
    const match = output.match(/^\s*0\.0\.0\.0\s+0\.0\.0\.0\s+(\d{1,3}(?:\.\d{1,3}){3})/m);
    if (match) return match[1];
  } catch { /* sem gateway detectavel */ }
  return null;
}

async function detectDefaultGateway() {
  return os.platform() === "win32" ? detectDefaultGatewayWindows() : detectDefaultGatewayLinux();
}

// ---------------------------------------------------------------------------
// Coleta SNMP por dispositivo
// ---------------------------------------------------------------------------

function numberOrNull(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

async function pollMemoryViaHrStorage(host, port, community, memOids, timeoutMs) {
  const descrRows = await snmpWalk(host, port, community, memOids.hrStorageDescr, { timeoutMs });
  const ramRow = descrRows.find((row) => /physical memory|real memory|main memory|^ram$/i.test(row.value || ""));
  if (!ramRow) return null;
  const index = ramRow.oid.slice(memOids.hrStorageDescr.length + 1);
  if (!index) return null;
  const sizeOid = `${memOids.hrStorageSize}.${index}`;
  const usedOid = `${memOids.hrStorageUsed}.${index}`;
  const result = await snmpGet(host, port, community, [sizeOid, usedOid], { timeoutMs });
  const size = numberOrNull(result[sizeOid]?.value);
  const used = numberOrNull(result[usedOid]?.value);
  if (!size) return null;
  return Math.max(0, Math.min(100, Math.round((used / size) * 100)));
}

async function pollCpuViaHrProcessorLoad(host, port, community, tableOid, timeoutMs) {
  const rows = await snmpWalk(host, port, community, tableOid, { timeoutMs });
  const values = rows.map((row) => numberOrNull(row.value)).filter((value) => value !== null);
  if (!values.length) return null;
  return Math.round(values.reduce((sum, value) => sum + value, 0) / values.length);
}

async function pollCpuAndMem(host, port, community, vendor, timeoutMs) {
  const template = vendorTemplate(vendor);
  if (vendor === "mikrotik") {
    return {
      cpuPercent: await pollCpuViaHrProcessorLoad(host, port, community, template.cpuOids.hrProcessorLoadTable, timeoutMs),
      memPercent: await pollMemoryViaHrStorage(host, port, community, template.memOids, timeoutMs)
    };
  }
  if (vendor === "fortigate") {
    const oids = [template.cpuOids.cpuUsage, template.memOids.memUsage];
    const result = await snmpGet(host, port, community, oids, { timeoutMs });
    return {
      cpuPercent: numberOrNull(result[template.cpuOids.cpuUsage]?.value),
      memPercent: numberOrNull(result[template.memOids.memUsage]?.value)
    };
  }
  if (vendor === "pfsense") {
    const oids = [template.cpuOids.cpuIdle, template.memOids.memTotalReal, template.memOids.memAvailReal];
    const result = await snmpGet(host, port, community, oids, { timeoutMs });
    const idle = numberOrNull(result[template.cpuOids.cpuIdle]?.value);
    const total = numberOrNull(result[template.memOids.memTotalReal]?.value);
    const avail = numberOrNull(result[template.memOids.memAvailReal]?.value);
    return {
      cpuPercent: idle !== null ? Math.max(0, Math.min(100, 100 - idle)) : null,
      memPercent: total ? Math.max(0, Math.min(100, Math.round(100 * (1 - avail / total)))) : null
    };
  }
  // generico — HOST-RESOURCES-MIB, funciona pra qualquer agente que a exponha
  return {
    cpuPercent: await pollCpuViaHrProcessorLoad(host, port, community, template.cpuOids.hrProcessorLoadTable, timeoutMs),
    memPercent: await pollMemoryViaHrStorage(host, port, community, template.memOids, timeoutMs)
  };
}

async function pollInterface(host, port, community, snmpIfIndex, timeoutMs) {
  const oids = {
    ifDescr: `${IF_MIB.ifDescr}.${snmpIfIndex}`,
    ifOperStatus: `${IF_MIB.ifOperStatus}.${snmpIfIndex}`,
    ifHCInOctets: `${IF_MIB.ifHCInOctets}.${snmpIfIndex}`,
    ifHCOutOctets: `${IF_MIB.ifHCOutOctets}.${snmpIfIndex}`,
    ifInOctets32: `${IF_MIB.ifInOctets32}.${snmpIfIndex}`,
    ifOutOctets32: `${IF_MIB.ifOutOctets32}.${snmpIfIndex}`
  };
  const result = await snmpGet(host, port, community, Object.values(oids), { timeoutMs });
  const hcIn = numberOrNull(result[oids.ifHCInOctets]?.value);
  const hcOut = numberOrNull(result[oids.ifHCOutOctets]?.value);
  const in32 = numberOrNull(result[oids.ifInOctets32]?.value);
  const out32 = numberOrNull(result[oids.ifOutOctets32]?.value);
  return {
    ifDescr: result[oids.ifDescr]?.value || "",
    ifOperStatus: numberOrNull(result[oids.ifOperStatus]?.value) ?? 0,
    inOctets: hcIn && hcIn > 0 ? hcIn : in32,
    outOctets: hcOut && hcOut > 0 ? hcOut : out32
  };
}

// Varre a tabela ifDescr inteira do dispositivo — usado pra alimentar o
// seletor de interfaces na UI (o admin escolhe pelo nome real da interface
// em vez de precisar descobrir o ifIndex na mao via SNMP walk manual).
async function discoverInterfaces(host, port, community, timeoutMs) {
  const rows = await snmpWalk(host, port, community, IF_MIB.ifDescr, { timeoutMs, maxRows: 200 });
  return rows
    .map((row) => {
      const ifIndex = Number(row.oid.slice(IF_MIB.ifDescr.length + 1));
      return Number.isFinite(ifIndex) ? { ifIndex, ifDescr: String(row.value || "").slice(0, 200) } : null;
    })
    .filter(Boolean);
}

async function pollDevice(target, timeoutMs) {
  const { deviceId, managementIp: host, snmpPort: port, snmpCommunity: community, vendor, interfaces } = target;
  const checkedAt = new Date().toISOString();
  let detectedVendor = null;
  try {
    const sys = await snmpGet(host, port, community, [IF_MIB.sysObjectID], { timeoutMs });
    const sysObjectId = sys[IF_MIB.sysObjectID]?.value;
    if (sysObjectId) detectedVendor = detectVendorFromSysObjectId(sysObjectId);
  } catch {
    // fingerprint eh best-effort — se falhar aqui, o resto da coleta ainda tenta rodar
  }

  let discoveredInterfaces = [];
  try {
    discoveredInterfaces = await discoverInterfaces(host, port, community, timeoutMs);
  } catch {
    // descoberta de interfaces eh best-effort — nao bloqueia o resto da coleta
  }

  const interfaceResults = [];
  for (const iface of interfaces || []) {
    try {
      const data = await pollInterface(host, port, community, iface.snmpIfIndex, timeoutMs);
      interfaceResults.push({ linkId: iface.linkId, checkedAt, ...data });
    } catch (error) {
      interfaceResults.push({ linkId: iface.linkId, checkedAt, ifOperStatus: 0, error: error.message });
    }
  }

  try {
    const { cpuPercent, memPercent } = await pollCpuAndMem(host, port, community, vendor, timeoutMs);
    return { deviceId, snmpStatus: "ok", cpuPercent, memPercent, detectedVendor, discoveredInterfaces, interfaceResults };
  } catch (error) {
    return {
      deviceId,
      snmpStatus: "unreachable",
      cpuPercent: null,
      memPercent: null,
      detectedVendor,
      discoveredInterfaces,
      error: error.message,
      interfaceResults
    };
  }
}

// ---------------------------------------------------------------------------
// Comunicacao com o servidor central
// ---------------------------------------------------------------------------

async function requestJsonOnce(config, path, options = {}) {
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

async function requestJson(config, path, options = {}) {
  try {
    return await requestJsonOnce(config, path, options);
  } catch {
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 1500));
    return requestJsonOnce(config, path, options);
  }
}

function probeMetadata(config, discoveredGatewayIp) {
  const addresses = localAddresses();
  return {
    probeId: config.probeId,
    name: config.name || config.probeId,
    version: VERSION,
    platform: os.platform(),
    hostName: os.hostname(),
    primaryAddress: addresses[0] || "",
    addresses,
    discoveredGatewayIp: discoveredGatewayIp || undefined
  };
}

async function getTargets(config, discoveredGatewayIp) {
  const metadata = probeMetadata(config, discoveredGatewayIp);
  const params = new URLSearchParams({
    probeId: metadata.probeId,
    name: metadata.name,
    version: metadata.version,
    hostName: metadata.hostName,
    primaryAddress: metadata.primaryAddress,
    addresses: JSON.stringify(metadata.addresses),
    platform: metadata.platform
  });
  if (metadata.discoveredGatewayIp) params.set("discoveredGatewayIp", metadata.discoveredGatewayIp);
  return requestJson(config, `/api/network-probe/targets?${params.toString()}`);
}

async function sendResults(config, deviceResults, discoveredGatewayIp) {
  if (!deviceResults.length) return;
  const metadata = probeMetadata(config, discoveredGatewayIp);
  await requestJson(config, "/api/network-probe/results", {
    method: "POST",
    body: JSON.stringify({ ...metadata, deviceResults })
  });
}

// ---------------------------------------------------------------------------
// Loop principal
// ---------------------------------------------------------------------------

async function runLoop(config) {
  const touchWatchdog = installProcessGuards(config);
  const nextChecks = new Map();
  let cachedTargets = [];
  let discoveredGatewayIp = null;
  let loopCount = 0;
  console.log(`ServerWatch Network Probe ${VERSION} started as ${config.probeId}`);

  for (;;) {
    touchWatchdog("loop-start");
    try {
      if (loopCount % GATEWAY_DETECT_EVERY_N_LOOPS === 0) {
        discoveredGatewayIp = (await detectDefaultGateway()) || discoveredGatewayIp;
        touchWatchdog("gateway-detect");
      }
      loopCount += 1;

      const payload = await getTargets(config, discoveredGatewayIp);
      touchWatchdog("targets");
      cachedTargets = Array.isArray(payload.targets) ? payload.targets : [];

      const now = Date.now();
      const dueTargets = cachedTargets.filter((target) => (nextChecks.get(target.deviceId) || 0) <= now);
      const deviceResults = [];
      for (const target of dueTargets) {
        deviceResults.push(await pollDevice(target, config.timeoutMs));
        nextChecks.set(target.deviceId, Date.now() + Math.max(30, config.intervalSeconds) * 1000);
        touchWatchdog("device-poll");
      }

      try {
        await sendResults(config, deviceResults, discoveredGatewayIp);
        touchWatchdog("send");
        if (deviceResults.length) console.log(`Sent ${deviceResults.length} device result(s)`);
      } catch (error) {
        console.error(`[${new Date().toISOString()}] Send failed: ${error.message}`);
      }
    } catch (error) {
      console.error(`[${new Date().toISOString()}] ${error.message}`);
    }
    touchWatchdog("loop-end");
    await new Promise((resolvePromise) => setTimeout(resolvePromise, Math.min(60, Math.max(10, config.intervalSeconds)) * 1000));
  }
}

const config = await loadConfig();
await runLoop(config);
