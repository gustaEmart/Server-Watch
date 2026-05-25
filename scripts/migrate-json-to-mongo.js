import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { createMongoStorage } from "../storage/mongo-storage.js";

const dataFile = resolve(process.env.DATA_FILE || process.argv[2] || "data/serverwatch.json");
const mongoUri = process.env.MONGODB_URI;
const mongoDb = process.env.MONGODB_DB || "serverwatch";

if (!mongoUri) {
  console.error("Defina MONGODB_URI antes de rodar a migracao.");
  process.exit(1);
}

const raw = await readFile(dataFile, "utf8");
const state = JSON.parse(raw);
const storage = createMongoStorage({ mongoUri, mongoDb });

try {
  await storage.saveState(state);
  console.log(`Migracao concluida: ${dataFile} -> MongoDB database '${mongoDb}'.`);
} finally {
  await storage.close();
}
