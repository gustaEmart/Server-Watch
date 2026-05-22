import { createServer } from "node:http";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

const DEFAULT_CONFIG = new URL("./config.json", import.meta.url);
const DEFAULT_PORT = 8777;

function argValue(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : null;
}

function numberValue(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

const configPath = argValue("--config") || process.env.SERVERWATCH_PROBE_CONFIG || DEFAULT_CONFIG;
const configFilePath = configPath instanceof URL ? fileURLToPath(configPath) : configPath;
const port = numberValue(argValue("--port") || process.env.SERVERWATCH_PROBE_SETUP_PORT, DEFAULT_PORT);

async function readJson(path) {
  try {
    return JSON.parse((await readFile(path, "utf8")).replace(/^\uFEFF/, ""));
  } catch (error) {
    if (error.code === "ENOENT") return {};
    throw error;
  }
}

function normalizeConfig(input) {
  const config = {
    serverUrl: String(input.serverUrl || "").trim().replace(/\/+$/, ""),
    probeId: String(input.probeId || "").trim(),
    name: String(input.name || input.probeId || "").trim(),
    token: String(input.token || "").trim(),
    intervalSeconds: numberValue(input.intervalSeconds, 10),
    timeoutMs: numberValue(input.timeoutMs, 2500)
  };

  if (!/^https?:\/\//i.test(config.serverUrl)) {
    throw new Error("Informe uma URL iniciando com http:// ou https://.");
  }
  if (!config.probeId) throw new Error("Informe o ID do probe.");
  if (!config.token) throw new Error("Informe o token do probe.");
  if (config.intervalSeconds < 3) throw new Error("O intervalo minimo e 3 segundos.");
  if (config.timeoutMs < 500) throw new Error("O timeout minimo e 500 ms.");

  return config;
}

async function readBody(request) {
  const chunks = [];
  for await (const chunk of request) {
    chunks.push(chunk);
    if (Buffer.concat(chunks).length > 64 * 1024) throw new Error("Payload muito grande.");
  }
  return Buffer.concat(chunks).toString("utf8");
}

function send(response, status, body, contentType = "text/plain; charset=utf-8") {
  response.writeHead(status, {
    "Content-Type": contentType,
    "Cache-Control": "no-store"
  });
  response.end(body);
}

function sendJson(response, status, body) {
  send(response, status, JSON.stringify(body), "application/json; charset=utf-8");
}

function page() {
  return `<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>ServerWatch Probe Setup</title>
  <style>
    :root {
      color-scheme: light;
      font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      background: #f7f8fb;
      color: #172033;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      min-height: 100vh;
      display: grid;
      place-items: center;
      padding: 24px;
    }
    main {
      width: min(720px, 100%);
      background: #ffffff;
      border: 1px solid #d8deea;
      border-radius: 8px;
      box-shadow: 0 18px 45px rgba(23, 32, 51, 0.08);
      padding: 28px;
    }
    h1 {
      margin: 0 0 6px;
      font-size: 24px;
      line-height: 1.2;
    }
    p {
      margin: 0 0 22px;
      color: #657085;
      line-height: 1.5;
    }
    form {
      display: grid;
      gap: 16px;
    }
    label {
      display: grid;
      gap: 7px;
      font-weight: 650;
      color: #29364d;
    }
    input {
      width: 100%;
      border: 1px solid #c8d0df;
      border-radius: 6px;
      padding: 11px 12px;
      font: inherit;
      color: #172033;
      background: #ffffff;
    }
    input:focus {
      outline: 3px solid rgba(37, 99, 235, 0.18);
      border-color: #2563eb;
    }
    .grid {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 16px;
    }
    button {
      width: fit-content;
      border: 0;
      border-radius: 6px;
      padding: 11px 16px;
      font: inherit;
      font-weight: 750;
      color: #ffffff;
      background: #2563eb;
      cursor: pointer;
    }
    button:disabled {
      cursor: wait;
      opacity: 0.7;
    }
    #message {
      min-height: 22px;
      font-weight: 650;
    }
    .ok { color: #0f766e; }
    .error { color: #b42318; }
    @media (max-width: 640px) {
      body { padding: 14px; }
      main { padding: 20px; }
      .grid { grid-template-columns: 1fr; }
    }
  </style>
</head>
<body>
  <main>
    <h1>ServerWatch Probe Setup</h1>
    <p>Configure este coletor local para enviar os resultados de monitoramento ao ServerWatch central.</p>
    <form id="form">
      <label>
        URL do ServerWatch
        <input name="serverUrl" placeholder="https://serverwatch.seudominio.com" autocomplete="url" required>
      </label>
      <div class="grid">
        <label>
          ID do probe
          <input name="probeId" placeholder="cliente-acme-sp" autocomplete="off" required>
        </label>
        <label>
          Nome
          <input name="name" placeholder="Cliente ACME - Sao Paulo" autocomplete="organization">
        </label>
      </div>
      <label>
        Token
        <input name="token" type="password" autocomplete="off" required>
      </label>
      <div class="grid">
        <label>
          Intervalo em segundos
          <input name="intervalSeconds" type="number" min="3" step="1" value="10" required>
        </label>
        <label>
          Timeout em ms
          <input name="timeoutMs" type="number" min="500" step="100" value="2500" required>
        </label>
      </div>
      <button type="submit">Salvar configuracao</button>
      <div id="message" role="status" aria-live="polite"></div>
    </form>
  </main>
  <script>
    const form = document.querySelector("#form");
    const message = document.querySelector("#message");

    function setMessage(text, type) {
      message.textContent = text;
      message.className = type || "";
    }

    async function loadConfig() {
      const response = await fetch("/api/config");
      const config = await response.json();
      for (const [key, value] of Object.entries(config)) {
        if (form.elements[key] && value !== undefined && value !== null) {
          form.elements[key].value = value;
        }
      }
    }

    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      setMessage("", "");
      const button = form.querySelector("button");
      button.disabled = true;
      try {
        const payload = Object.fromEntries(new FormData(form).entries());
        payload.intervalSeconds = Number(payload.intervalSeconds);
        payload.timeoutMs = Number(payload.timeoutMs);
        const response = await fetch("/api/config", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload)
        });
        const body = await response.json();
        if (!response.ok) throw new Error(body.error || "Nao foi possivel salvar.");
        setMessage("Configuracao salva. Reinicie o servico do probe para aplicar.", "ok");
      } catch (error) {
        setMessage(error.message, "error");
      } finally {
        button.disabled = false;
      }
    });

    loadConfig().catch((error) => setMessage(error.message, "error"));
  </script>
</body>
</html>`;
}

const server = createServer(async (request, response) => {
  try {
    const url = new URL(request.url, `http://${request.headers.host || "localhost"}`);
    if (request.method === "GET" && (url.pathname === "/" || url.pathname === "/setup")) {
      send(response, 200, page(), "text/html; charset=utf-8");
      return;
    }
    if (request.method === "GET" && url.pathname === "/api/config") {
      sendJson(response, 200, await readJson(configFilePath));
      return;
    }
    if (request.method === "POST" && url.pathname === "/api/config") {
      const payload = JSON.parse(await readBody(request));
      const config = normalizeConfig(payload);
      await mkdir(dirname(configFilePath), { recursive: true });
      await writeFile(configFilePath, `${JSON.stringify(config, null, 2)}\n`, "utf8");
      sendJson(response, 200, { ok: true });
      return;
    }
    sendJson(response, 404, { error: "Not found" });
  } catch (error) {
    sendJson(response, 400, { error: error.message });
  }
});

server.listen(port, () => {
  console.log(`ServerWatch Probe setup available at http://localhost:${port}/setup`);
  console.log(`Config file: ${configFilePath}`);
});
