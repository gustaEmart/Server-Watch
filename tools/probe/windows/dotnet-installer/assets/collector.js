import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import os from "node:os";

const DEFAULT_CONFIG = new URL("./config.json", import.meta.url);
const VERSION = "0.1.0";

function argValue(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : null;
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
    serverUrl: String(config.serverUrl).replace(/\/+$/, "")
  };
}

function buildPingArgs(hostname, timeoutMs) {
  if (os.platform() === "win32") {
    return ["-n", "1", "-w", String(timeoutMs), hostname];
  }
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
    [/unknown host/i, "Hostname nao encontrado."],
    [/100%\s*(?:loss|de\s+perda)/i, "Sem resposta ao ping."],
    [/(?:received|recebidos)\s*=\s*0/i, "Sem resposta ao ping."]
  ];
  return checks.find(([pattern]) => pattern.test(output))?.[1] || null;
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
    const child = spawn("ping", buildPingArgs(hostname, timeoutMs), { shell: false });
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
        latencyMs: online ? latencyMs ?? Date.now() - startedAt : null,
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
      ...(options.headers || {})
    }
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || `HTTP ${response.status}`);
  return body;
}

async function getTargets(config) {
  const params = new URLSearchParams({
    probeId: config.probeId,
    name: config.name || config.probeId,
    version: VERSION
  });
  return requestJson(config, `/api/probe/targets?${params.toString()}`);
}

async function sendResults(config, results) {
  if (!results.length) return;
  await requestJson(config, "/api/probe/results", {
    method: "POST",
    body: JSON.stringify({
      probeId: config.probeId,
      name: config.name || config.probeId,
      version: VERSION,
      results
    })
  });
}

async function runLoop(config) {
  const nextChecks = new Map();
  console.log(`ServerWatch Probe ${VERSION} started as ${config.probeId}`);
  for (;;) {
    try {
      const payload = await getTargets(config);
      const now = Date.now();
      const dueTargets = (payload.targets || []).filter((target) => {
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
      await sendResults(config, results);
      if (results.length) console.log(`Sent ${results.length} result(s)`);
    } catch (error) {
      console.error(`[${new Date().toISOString()}] ${error.message}`);
    }
    await new Promise((resolve) => setTimeout(resolve, Math.max(3, config.intervalSeconds) * 1000));
  }
}

const config = await loadConfig();
await runLoop(config);
