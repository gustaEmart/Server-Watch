import { MongoClient } from "mongodb";

const STATE_ID = "serverwatch-state";
const COLLECTION = "app_state";

export function createMongoStorage({ mongoUri, mongoDb }) {
  if (!mongoUri) {
    throw new Error("MONGODB_URI precisa ser definido quando SERVERWATCH_STORAGE=mongodb.");
  }

  const client = new MongoClient(mongoUri);
  let connected = false;

  async function collection() {
    if (!connected) {
      await client.connect();
      connected = true;
    }
    return client.db(mongoDb || "serverwatch").collection(COLLECTION);
  }

  return {
    kind: "mongodb",
    async loadState() {
      const states = await collection();
      const doc = await states.findOne({ _id: STATE_ID });
      if (!doc) return null;
      const { _id, updatedAt, ...state } = doc;
      return state;
    },
    async saveState(state) {
      const states = await collection();
      await states.replaceOne(
        { _id: STATE_ID },
        {
          _id: STATE_ID,
          ...state,
          updatedAt: new Date().toISOString()
        },
        { upsert: true }
      );
    },
    async close() {
      if (connected) await client.close();
      connected = false;
    }
  };
}
