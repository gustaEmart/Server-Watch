function stripAccents(value) {
  let result = "";
  for (const ch of String(value)) {
    const code = ch.codePointAt(0);
    if (code < 128) {
      result += ch;
      continue;
    }
    const decomposed = ch.normalize("NFD");
    const base = decomposed.codePointAt(0) < 128 ? decomposed[0] : "";
    result += base;
  }
  return result;
}

function normalizeMatchKey(value) {
  return stripAccents(String(value || "").toLowerCase()).replace(/[^a-z0-9]+/g, "");
}

export { normalizeMatchKey };

import https from "node:https";
import { URL } from "node:url";

// O PBS usa certificado autoassinado. Em vez de desabilitar a verificacao de
// TLS (rejectUnauthorized:false sem nenhuma checagem compensatoria), fixamos
// (pin) o fingerprint SHA-256 esperado do certificado via checkServerIdentity:
// a conexao so e aceita se o certificado apresentado bater exatamente com o
// fingerprint configurado em PROXMOX_PBS_TLS_FINGERPRINT. Qualquer outro
// certificado (incluindo um ataque man-in-the-middle) e rejeitado.
function pbsRequest(config, path) {
  return new Promise((resolve, reject) => {
    let target;
    try {
      target = new URL(`${config.baseUrl}${path}`);
    } catch {
      reject(new Error("URL do PBS invalida."));
      return;
    }
    const auth = `PBSAPIToken=${config.tokenId}:${config.tokenSecret}`;
    const expectedFingerprint = String(config.tlsFingerprint || "").replace(/:/g, "").toUpperCase();

    const options = {
      hostname: target.hostname,
      port: target.port || 443,
      path: `${target.pathname}${target.search}`,
      method: "GET",
      headers: { Authorization: auth },
      rejectUnauthorized: !expectedFingerprint,
      checkServerIdentity: expectedFingerprint
        ? (_hostname, cert) => {
            const actual = String(cert.fingerprint256 || "").replace(/:/g, "").toUpperCase();
            if (actual !== expectedFingerprint) {
              return new Error("Certificado do PBS nao corresponde ao fingerprint configurado.");
            }
            return undefined;
          }
        : undefined
    };

    const req = https.request(options, (res) => {
      let raw = "";
      res.setEncoding("utf8");
      res.on("data", (chunk) => {
        raw += chunk;
      });
      res.on("end", () => {
        if (res.statusCode < 200 || res.statusCode >= 300) {
          reject(new Error(`PBS respondeu ${res.statusCode} em ${path}`));
          return;
        }
        try {
          resolve(JSON.parse(raw));
        } catch {
          reject(new Error(`Resposta invalida do PBS em ${path}`));
        }
      });
    });
    req.on("error", reject);
    req.end();
  });
}

async function pbsGet(config, path) {
  const body = await pbsRequest(config, path);
  return body.data;
}

export async function fetchProxmoxBackupSummary(config) {
  const datastores = await pbsGet(config, "/api2/json/admin/datastore");
  const items = [];
  const datastoreCapacity = [];
  for (const ds of datastores || []) {
    const store = ds.store;
    try {
      const status = await pbsGet(config, `/api2/json/admin/datastore/${encodeURIComponent(store)}/status`);
      datastoreCapacity.push({
        datastore: store,
        totalBytes: Number(status?.total) || 0,
        usedBytes: Number(status?.used) || 0,
        availBytes: Number(status?.avail) || 0
      });
    } catch {
      // status indisponivel para este datastore; segue sem capacidade
    }
    let namespaces = [{ ns: "" }];
    try {
      const nsList = await pbsGet(config, `/api2/json/admin/datastore/${encodeURIComponent(store)}/namespace`);
      if (Array.isArray(nsList) && nsList.length) namespaces = nsList;
    } catch {
      // datastore sem suporte a namespace ou sem permissao; mantem namespace raiz
    }
    for (const nsEntry of namespaces) {
      const ns = nsEntry.ns || "";
      const qs = ns ? `?ns=${encodeURIComponent(ns)}` : "";
      let snapshots = [];
      try {
        snapshots = await pbsGet(config, `/api2/json/admin/datastore/${encodeURIComponent(store)}/snapshots${qs}`);
      } catch {
        continue;
      }
      const latestByGuest = new Map();
      for (const snap of snapshots || []) {
        const key = `${snap["backup-type"]}:${snap["backup-id"]}`;
        const existing = latestByGuest.get(key);
        if (!existing || Number(snap["backup-time"]) > Number(existing["backup-time"])) {
          latestByGuest.set(key, snap);
        }
      }
      for (const snap of latestByGuest.values()) {
        items.push({
          datastore: store,
          namespace: ns,
          backupType: snap["backup-type"] || "vm",
          backupId: String(snap["backup-id"] ?? ""),
          comment: String(snap.comment || ""),
          lastSnapshotAt: snap["backup-time"] ? new Date(Number(snap["backup-time"]) * 1000).toISOString() : null,
          sizeBytes: Number(snap.size) || 0,
          verifyState: snap.verification?.state || null,
          protected: Boolean(snap.protected)
        });
      }
    }
  }
  return {
    configured: true,
    fetchedAt: new Date().toISOString(),
    error: null,
    items,
    datastores: datastoreCapacity
  };
}

export function emptyProxmoxBackupState() {
  return {
    configured: false,
    fetchedAt: null,
    error: null,
    items: [],
    datastores: [],
    datastoreHistory: []
  };
}

const STALE_HOURS_BY_DEFAULT = 26;

export function proxmoxItemStatus(item) {
  if (!item.lastSnapshotAt) return "error";
  if (item.verifyState === "failed" || item.verifyState === "error") return "error";
  const ageHours = (Date.now() - new Date(item.lastSnapshotAt).getTime()) / 36e5;
  if (ageHours > STALE_HOURS_BY_DEFAULT) return "error";
  if (ageHours > STALE_HOURS_BY_DEFAULT * 0.7) return "warning";
  return "success";
}
