import { copyFile, mkdir, readFile, readdir, rename, unlink, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { basename, dirname, extname, join } from "node:path";

const MAX_BACKUPS = 10;
const BACKUP_INTERVAL_MS = 60_000;

function backupPrefix(dataFile) {
  const extension = extname(dataFile);
  const name = basename(dataFile, extension);
  return `${name}.backup-`;
}

function backupFileName(dataFile) {
  const stamp = new Date().toISOString().replace(/[-:T.Z]/g, "").slice(0, 14);
  return join(dirname(dataFile), `${backupPrefix(dataFile)}${stamp}${extname(dataFile)}`);
}

async function parseState(raw, source) {
  try {
    return JSON.parse(raw);
  } catch (error) {
    throw new Error(`Estado JSON invalido em ${source}: ${error.message}`);
  }
}

async function loadLatestBackup(dataFile) {
  const dir = dirname(dataFile);
  const prefix = backupPrefix(dataFile);
  const extension = extname(dataFile);
  const files = await readdir(dir).catch(() => []);
  const backups = files
    .filter((file) => file.startsWith(prefix) && file.endsWith(extension))
    .sort()
    .reverse();

  for (const file of backups) {
    const fullPath = join(dir, file);
    const raw = await readFile(fullPath, "utf8").catch(() => "");
    if (!raw.trim()) continue;
    try {
      return await parseState(raw, fullPath);
    } catch {
      continue;
    }
  }
  return null;
}

async function pruneBackups(dataFile) {
  const dir = dirname(dataFile);
  const prefix = backupPrefix(dataFile);
  const extension = extname(dataFile);
  const files = await readdir(dir).catch(() => []);
  const backups = files
    .filter((file) => file.startsWith(prefix) && file.endsWith(extension))
    .sort()
    .reverse();
  await Promise.all(backups.slice(MAX_BACKUPS).map((file) => unlink(join(dir, file)).catch(() => {})));
}

export function createJsonStorage({ dataFile }) {
  let lastBackupAt = 0;

  return {
    kind: "json",
    async loadState() {
      if (!existsSync(dataFile)) return null;
      const raw = await readFile(dataFile, "utf8");
      if (!raw.trim()) {
        const recovered = await loadLatestBackup(dataFile);
        if (recovered) return recovered;
        throw new Error(`Estado JSON vazio em ${dataFile} e nenhum backup valido foi encontrado.`);
      }
      try {
        return await parseState(raw, dataFile);
      } catch (error) {
        const recovered = await loadLatestBackup(dataFile);
        if (recovered) return recovered;
        throw error;
      }
    },
    async saveState(state) {
      await mkdir(dirname(dataFile), { recursive: true });
      if (existsSync(dataFile) && Date.now() - lastBackupAt >= BACKUP_INTERVAL_MS) {
        const current = await readFile(dataFile, "utf8").catch(() => "");
        if (current.trim()) {
          await copyFile(dataFile, backupFileName(dataFile)).catch(() => {});
          lastBackupAt = Date.now();
        }
      }
      const tempFile = `${dataFile}.${process.pid}.${Date.now()}.tmp`;
      await writeFile(tempFile, JSON.stringify(state, null, 2), "utf8");
      await rename(tempFile, dataFile);
      await pruneBackups(dataFile);
    },
    async close() {
    }
  };
}
