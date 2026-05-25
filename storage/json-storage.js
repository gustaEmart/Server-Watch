import { mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname } from "node:path";

export function createJsonStorage({ dataFile }) {
  return {
    kind: "json",
    async loadState() {
      if (!existsSync(dataFile)) return null;
      const raw = await readFile(dataFile, "utf8");
      return JSON.parse(raw);
    },
    async saveState(state) {
      await mkdir(dirname(dataFile), { recursive: true });
      await writeFile(dataFile, JSON.stringify(state, null, 2), "utf8");
    },
    async close() {
    }
  };
}
