import { spawn } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { pollDevice } from "./snmp/poller.js";

const DEFAULT_CONFIG = new URL("./config.json", import.meta.url);
// Mantido em sincronia manual com NETWORK_PROBE_COLLECTOR_VERSION no
// server.js — sem isso o servidor nunca reconhece uma atualizacao como
// concluida (compara probe.version contra esse numero).
const VERSION = "0.2.0";
const handledUpdateRequests = new Set();
const REQUEST_TIMEOUT_MS = 15000;
const LOOP_WATCHDOG_MS = 90 * 1000;
const SNMP_TIMEOUT_MS = 3000;
const GATEWAY_DETECT_EVERY_N_LOOPS = 10;
// Teste ativo de banda (download/upload real contra servidor externo, nao o
// trafego SNMP passivo) — satura o link de proposito por um instante, entao
// nao roda a cada ciclo normal. Cadencia configuravel via
// speedTestIntervalMinutes no config.json (padrao 60min, pra saturar o
// minimo possivel); tambem roda sob demanda via botao "Testar agora"
// (forceSpeedTestAt em /api/network-probe/targets).
// Payload reduzido (14MB no total) pra encurtar a janela de saturacao —
// menos incomodo pra trafego real (VOIP/videochamada) durante o teste.
const DEFAULT_SPEEDTEST_INTERVAL_MINUTES = 60;
const SPEEDTEST_DOWNLOAD_BYTES = 10_000_000;
const SPEEDTEST_UPLOAD_BYTES = 4_000_000;
const SPEEDTEST_TIMEOUT_MS = 20_000;

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
    speedTestIntervalMinutes: DEFAULT_SPEEDTEST_INTERVAL_MINUTES,
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
// Coleta SNMP por dispositivo — implementacao compartilhada com o coletor
// central do servidor, ver ./snmp/poller.js
// ---------------------------------------------------------------------------

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

async function sendResults(config, deviceResults, discoveredGatewayIp, speedTest) {
  if (!deviceResults.length && !speedTest) return;
  const metadata = probeMetadata(config, discoveredGatewayIp);
  await requestJson(config, "/api/network-probe/results", {
    method: "POST",
    body: JSON.stringify({ ...metadata, deviceResults, speedTest: speedTest || undefined })
  });
}

// ---------------------------------------------------------------------------
// Teste ativo de velocidade — mede o link de internet de verdade (satura por
// alguns segundos), diferente do trafego SNMP passivo que so mostra o que ja
// esta sendo usado organicamente. Usa os endpoints publicos do Cloudflare
// (mesmos usados pelo speed.cloudflare.com), sem dependencia externa.
async function speedTestDownload(bytes, timeoutMs) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  const start = process.hrtime.bigint();
  try {
    const response = await fetch(`https://speed.cloudflare.com/__down?bytes=${bytes}`, { signal: controller.signal });
    if (!response.ok || !response.body) throw new Error(`Download speed test HTTP ${response.status}`);
    let received = 0;
    const reader = response.body.getReader();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      received += value.length;
    }
    const elapsedSeconds = Number(process.hrtime.bigint() - start) / 1e9;
    if (elapsedSeconds <= 0 || received === 0) throw new Error("Download speed test sem dados.");
    return Math.round((received * 8) / elapsedSeconds);
  } finally {
    clearTimeout(timeoutId);
  }
}

async function speedTestUpload(bytes, timeoutMs) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  const payload = Buffer.alloc(bytes);
  const start = process.hrtime.bigint();
  try {
    const response = await fetch("https://speed.cloudflare.com/__up", {
      method: "POST",
      body: payload,
      signal: controller.signal,
      headers: { "Content-Type": "application/octet-stream" }
    });
    if (!response.ok) throw new Error(`Upload speed test HTTP ${response.status}`);
    await response.arrayBuffer().catch(() => null);
    const elapsedSeconds = Number(process.hrtime.bigint() - start) / 1e9;
    if (elapsedSeconds <= 0) throw new Error("Upload speed test sem dados.");
    return Math.round((payload.length * 8) / elapsedSeconds);
  } finally {
    clearTimeout(timeoutId);
  }
}

async function runSpeedTest() {
  const downloadBps = await speedTestDownload(SPEEDTEST_DOWNLOAD_BYTES, SPEEDTEST_TIMEOUT_MS);
  const uploadBps = await speedTestUpload(SPEEDTEST_UPLOAD_BYTES, SPEEDTEST_TIMEOUT_MS);
  return {
    downloadMbps: Math.round((downloadBps / 1_000_000) * 10) / 10,
    uploadMbps: Math.round((uploadBps / 1_000_000) * 10) / 10,
    testedAt: new Date().toISOString()
  };
}

// ---------------------------------------------------------------------------
// Atualizacao remota — mesmo mecanismo do probe de host (probe/collector.js):
// o servidor sinaliza um updateRequest pendente em /api/network-probe/targets,
// o coletor dispara o proprio instalador em modo reparo/atualizacao e reporta
// o resultado em /api/probe/update-status (rota compartilhada com o probe de
// host — generica por probeId, nao filtra por probeType).
// ---------------------------------------------------------------------------

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
  const child = spawn(command, args, { detached: true, stdio: "ignore" });
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
    `curl -fsSL ${shellQuote(`${config.serverUrl}/downloads/network-probe/linux-installer`)}`,
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
  const unitName = `serverwatch-network-probe-update-${String(request.id).replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 24)}`;
  await reportUpdateStatus(config, request, "running");

  try {
    spawnDetached("systemd-run", [
      "--unit",
      unitName,
      "--description",
      "ServerWatch Network Probe update",
      "/usr/bin/env",
      "bash",
      "-lc",
      installCommand
    ]);
    console.log(`Scheduled network probe update ${request.id} to ${request.targetVersion || "latest"}`);
  } catch (error) {
    await reportUpdateStatus(config, request, "failed", error.message);
  }
}

async function handleWindowsUpdateRequest(config, request) {
  await reportUpdateStatus(config, request, "running");
  try {
    const installDir = dirname(fileURLToPath(import.meta.url));
    const installerPath = resolve(installDir, "Install-NetworkProbeCollector-Headless.ps1");
    await downloadToFile(config, "/downloads/network-probe/windows-ps1-installer", installerPath);
    const updateTaskName = "ServerWatch Network Probe Update";
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
    console.log(`Scheduled network probe update ${request.id} to ${request.targetVersion || "latest"}`);
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

// ---------------------------------------------------------------------------
// Loop principal
// ---------------------------------------------------------------------------

async function runLoop(config) {
  const touchWatchdog = installProcessGuards(config);
  const nextChecks = new Map();
  let cachedTargets = [];
  let discoveredGatewayIp = null;
  let loopCount = 0;
  let lastSeenForceSpeedTestAt = null;
  const loopIntervalSeconds = Math.min(60, Math.max(10, config.intervalSeconds));
  const speedTestEveryNLoops = Math.max(
    1,
    Math.round((Math.max(1, Number(config.speedTestIntervalMinutes) || DEFAULT_SPEEDTEST_INTERVAL_MINUTES) * 60) / loopIntervalSeconds)
  );
  console.log(`ServerWatch Network Probe ${VERSION} started as ${config.probeId}`);

  for (;;) {
    touchWatchdog("loop-start");
    try {
      if (loopCount % GATEWAY_DETECT_EVERY_N_LOOPS === 0) {
        discoveredGatewayIp = (await detectDefaultGateway()) || discoveredGatewayIp;
        touchWatchdog("gateway-detect");
      }

      const payload = await getTargets(config, discoveredGatewayIp);
      touchWatchdog("targets");
      cachedTargets = Array.isArray(payload.targets) ? payload.targets : [];

      if (payload.updateRequest) {
        try {
          await handleUpdateRequest(config, payload.updateRequest);
        } catch (error) {
          console.error(`[${new Date().toISOString()}] Update request failed: ${error.message}`);
        }
      }

      const now = Date.now();
      const dueTargets = cachedTargets.filter((target) => (nextChecks.get(target.deviceId) || 0) <= now);
      const deviceResults = [];
      for (const target of dueTargets) {
        deviceResults.push(await pollDevice(target, config.timeoutMs));
        nextChecks.set(target.deviceId, Date.now() + Math.max(30, config.intervalSeconds) * 1000);
        touchWatchdog("device-poll");
      }

      const forcedSpeedTest = Boolean(payload.forceSpeedTestAt) && payload.forceSpeedTestAt !== lastSeenForceSpeedTestAt;
      let speedTest = null;
      if (forcedSpeedTest || loopCount % speedTestEveryNLoops === 0) {
        if (payload.forceSpeedTestAt) lastSeenForceSpeedTestAt = payload.forceSpeedTestAt;
        try {
          speedTest = await runSpeedTest();
          touchWatchdog("speed-test");
          console.log(`Speed test: ${speedTest.downloadMbps} Mbps down / ${speedTest.uploadMbps} Mbps up`);
        } catch (error) {
          console.error(`[${new Date().toISOString()}] Speed test failed: ${error.message}`);
        }
      }
      loopCount += 1;

      try {
        await sendResults(config, deviceResults, discoveredGatewayIp, speedTest);
        touchWatchdog("send");
        if (deviceResults.length) console.log(`Sent ${deviceResults.length} device result(s)`);
      } catch (error) {
        console.error(`[${new Date().toISOString()}] Send failed: ${error.message}`);
      }
    } catch (error) {
      console.error(`[${new Date().toISOString()}] ${error.message}`);
    }
    touchWatchdog("loop-end");
    await new Promise((resolvePromise) => setTimeout(resolvePromise, loopIntervalSeconds * 1000));
  }
}

const config = await loadConfig();
await runLoop(config);
