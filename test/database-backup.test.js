import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  databaseBackupSettings,
  ensureDatabaseBackupWorkspace,
  isDatabaseBackupArchiveName,
  normalizeDatabaseBackupSettings,
  queueDatabaseBackup,
  writeDatabaseBackupWorkerConfig
} from "../services/databaseBackup.js";

test("normaliza e preserva a configuracao da rotina de backup", () => {
  const state = normalizeDatabaseBackupSettings({ enabled: false, scheduleHour: 4, retentionDays: 21 }, {});
  assert.deepEqual(databaseBackupSettings(state), { enabled: false, scheduleHour: 4, retentionDays: 21 });
  assert.throws(() => normalizeDatabaseBackupSettings({ scheduleHour: 24 }, state), /entre 0 e 23/);
  assert.throws(() => normalizeDatabaseBackupSettings({ retentionDays: 0 }, state), /entre 1 e 365/);
});

test("cria uma solicitacao atomica e config segura para o worker", async () => {
  const root = await mkdtemp(join(tmpdir(), "serverwatch-db-backup-"));
  try {
    const paths = await ensureDatabaseBackupWorkspace(root);
    const request = await queueDatabaseBackup(root);
    assert.equal(request.action, "backup");
    const config = await writeDatabaseBackupWorkerConfig(root, { enabled: true, scheduleHour: 3, retentionDays: 10 });
    assert.deepEqual(config, { enabled: true, scheduleHour: 3, retentionDays: 10 });
    assert.match(await readFile(paths.config, "utf8"), /ENABLED=1\nSCHEDULE_HOUR=3\nRETENTION_DAYS=10/);
    assert.equal(isDatabaseBackupArchiveName("serverwatch-manual-20260722T031500Z.archive.gz"), true);
    assert.equal(isDatabaseBackupArchiveName("../../dados.json"), false);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
