import { readdir, readFile, rename, stat, writeFile, mkdir } from "node:fs/promises";
import { join, resolve } from "node:path";
import { randomUUID } from "node:crypto";

const ARCHIVE_PATTERN = /^serverwatch-(?:manual|scheduled|pre-restore)-\d{8}T\d{6}Z(?:-[a-z0-9-]+)?\.archive\.gz$/i;
const REQUEST_PATTERN = /^\d+-[a-f0-9-]+\.request$/i;

function directoryPaths(baseDir) {
  const root = resolve(baseDir);
  return {
    root,
    archives: join(root, "archives"),
    requests: join(root, "requests"),
    config: join(root, "worker.env"),
    activity: join(root, "activity.log"),
    currentJob: join(root, "current-job")
  };
}

function isoNow() {
  return new Date().toISOString();
}

function sanitizeMessage(value) {
  return String(value || "")
    .replace(/[\r\n|]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 500);
}

async function atomicWrite(file, content) {
  const temporary = `${file}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(temporary, content, "utf8");
  await rename(temporary, file);
}

export function normalizeDatabaseBackupSettings(payload = {}, existing = {}) {
  const current = existing.databaseBackup || {};
  const incoming = payload.databaseBackup || payload;
  const enabled = Boolean(incoming.enabled ?? current.enabled ?? true);
  const scheduleHour = Number(incoming.scheduleHour ?? current.scheduleHour ?? 2);
  const retentionDays = Number(incoming.retentionDays ?? current.retentionDays ?? 14);

  if (!Number.isFinite(scheduleHour) || scheduleHour < 0 || scheduleHour > 23) {
    const error = new Error("Horario do backup deve ficar entre 0 e 23 horas.");
    error.statusCode = 400;
    throw error;
  }
  if (!Number.isFinite(retentionDays) || retentionDays < 1 || retentionDays > 365) {
    const error = new Error("Retencao deve ficar entre 1 e 365 dias.");
    error.statusCode = 400;
    throw error;
  }

  return {
    ...existing,
    databaseBackup: {
      enabled,
      scheduleHour: Math.round(scheduleHour),
      retentionDays: Math.round(retentionDays)
    }
  };
}

export function databaseBackupSettings(settings = {}) {
  return normalizeDatabaseBackupSettings({}, settings).databaseBackup;
}

export async function ensureDatabaseBackupWorkspace(baseDir) {
  const paths = directoryPaths(baseDir);
  await Promise.all([mkdir(paths.root, { recursive: true }), mkdir(paths.archives, { recursive: true }), mkdir(paths.requests, { recursive: true })]);
  return paths;
}

export async function writeDatabaseBackupWorkerConfig(baseDir, settings) {
  const paths = await ensureDatabaseBackupWorkspace(baseDir);
  const normalized = databaseBackupSettings({ databaseBackup: settings });
  const content = [
    `ENABLED=${normalized.enabled ? 1 : 0}`,
    `SCHEDULE_HOUR=${normalized.scheduleHour}`,
    `RETENTION_DAYS=${normalized.retentionDays}`,
    ""
  ].join("\n");
  await atomicWrite(paths.config, content);
  return normalized;
}

export function isDatabaseBackupArchiveName(filename) {
  return ARCHIVE_PATTERN.test(String(filename || ""));
}

async function readActivity(paths) {
  try {
    const raw = await readFile(paths.activity, "utf8");
    return raw
      .trim()
      .split("\n")
      .filter(Boolean)
      .map((line) => {
        const [at, type, status, file, message] = line.split("|");
        return { at: at || null, type: type || "backup", status: status || "unknown", file: isDatabaseBackupArchiveName(file) ? file : null, message: message || "" };
      })
      .filter((entry) => entry.at)
      .slice(-100)
      .reverse();
  } catch {
    return [];
  }
}

async function readCurrentJob(paths) {
  try {
    const raw = await readFile(paths.currentJob, "utf8");
    const [type, requestedAt, file] = raw.trim().split("|");
    return type ? { type, requestedAt: requestedAt || null, file: isDatabaseBackupArchiveName(file) ? file : null } : null;
  } catch {
    return null;
  }
}

export async function listDatabaseBackups(baseDir) {
  const paths = await ensureDatabaseBackupWorkspace(baseDir);
  const entries = await readdir(paths.archives, { withFileTypes: true });
  const backups = await Promise.all(entries
    .filter((entry) => entry.isFile() && isDatabaseBackupArchiveName(entry.name))
    .map(async (entry) => {
      const file = join(paths.archives, entry.name);
      const details = await stat(file);
      return { filename: entry.name, size: details.size, createdAt: details.mtime.toISOString() };
    }));
  return backups.sort((left, right) => new Date(right.createdAt) - new Date(left.createdAt));
}

export async function databaseBackupInfo(baseDir, settings) {
  const paths = await ensureDatabaseBackupWorkspace(baseDir);
  const [backups, activity, currentJob] = await Promise.all([listDatabaseBackups(baseDir), readActivity(paths), readCurrentJob(paths)]);
  const lastSuccess = activity.find((entry) => entry.status === "success") || null;
  const lastFailure = activity.find((entry) => entry.status === "failed") || null;
  return {
    settings: databaseBackupSettings({ databaseBackup: settings }),
    backups,
    activity,
    currentJob,
    lastSuccess,
    lastFailure
  };
}

async function pendingRequest(paths) {
  const entries = await readdir(paths.requests, { withFileTypes: true });
  return entries.some((entry) => entry.isFile() && REQUEST_PATTERN.test(entry.name));
}

async function queueRequest(baseDir, action, filename = "") {
  const paths = await ensureDatabaseBackupWorkspace(baseDir);
  if (await pendingRequest(paths)) {
    const error = new Error("Ja existe uma operacao de backup aguardando processamento.");
    error.statusCode = 409;
    throw error;
  }
  const id = `${Date.now()}-${randomUUID()}`;
  const requestedAt = isoNow();
  const content = `${action}|${requestedAt}|${filename}\n`;
  await atomicWrite(join(paths.requests, `${id}.request`), content);
  return { id, action, requestedAt, filename: filename || null };
}

export async function queueDatabaseBackup(baseDir) {
  return queueRequest(baseDir, "backup");
}

export async function queueDatabaseRestore(baseDir, filename) {
  const safeName = String(filename || "").trim();
  if (!isDatabaseBackupArchiveName(safeName)) {
    const error = new Error("Arquivo de backup invalido.");
    error.statusCode = 400;
    throw error;
  }
  const paths = await ensureDatabaseBackupWorkspace(baseDir);
  try {
    await stat(join(paths.archives, safeName));
  } catch {
    const error = new Error("Arquivo de backup nao encontrado.");
    error.statusCode = 404;
    throw error;
  }
  return queueRequest(baseDir, "restore", safeName);
}

export async function resolveDatabaseBackupArchive(baseDir, filename) {
  const safeName = String(filename || "").trim();
  if (!isDatabaseBackupArchiveName(safeName)) return null;
  const paths = await ensureDatabaseBackupWorkspace(baseDir);
  const path = join(paths.archives, safeName);
  try {
    const details = await stat(path);
    return details.isFile() ? { path, filename: safeName, size: details.size } : null;
  } catch {
    return null;
  }
}

export function databaseBackupFailureMessage(entry) {
  return sanitizeMessage(entry?.message || "Falha na rotina de backup do MongoDB.") || "Falha na rotina de backup do MongoDB.";
}
