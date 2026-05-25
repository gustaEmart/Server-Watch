import { createJsonStorage } from "./json-storage.js";

export function createStorage(options) {
  const type = String(options.type || "json").trim().toLowerCase();
  if (type === "json") return createJsonStorage(options);
  if (type === "mongodb" || type === "mongo") return createLazyMongoStorage(options);
  throw new Error(`SERVERWATCH_STORAGE invalido: ${type}`);
}

function createLazyMongoStorage(options) {
  let storagePromise = null;

  async function storage() {
    if (!storagePromise) {
      storagePromise = import("./mongo-storage.js").then(({ createMongoStorage }) => createMongoStorage(options));
    }
    return storagePromise;
  }

  return {
    kind: "mongodb",
    async loadState() {
      return (await storage()).loadState();
    },
    async saveState(state) {
      return (await storage()).saveState(state);
    },
    async close() {
      if (storagePromise) await (await storagePromise).close();
    }
  };
}
