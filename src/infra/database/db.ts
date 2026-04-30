import Database from "@tauri-apps/plugin-sql";

let _db: Database | null = null;
let _initPromise: Promise<Database> | null = null;

const DB_URL = import.meta.env.DEV ? "sqlite:deskclock-dev.db" : "sqlite:deskclock.db";

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

// Race condition: when multiple Tauri windows load simultaneously on a fresh DB,
// concurrent Database.load() calls can see _sqlx_migrations in a partial state
// and throw "previously applied but has been modified". Retrying after a short
// delay lets the winning window finish writing the correct checksum.
async function loadWithRetry(retries = 5, delayMs = 200): Promise<Database> {
  for (let i = 0; i < retries; i++) {
    try {
      return await Database.load(DB_URL);
    } catch (err) {
      const msg = String(err);
      if (i < retries - 1 && (msg.includes("previously applied") || msg.includes("has been modified"))) {
        await sleep(delayMs * (i + 1));
        continue;
      }
      throw err;
    }
  }
  throw new Error("Failed to initialize database");
}

export async function getDb(): Promise<Database> {
  if (_db) return _db;
  if (!_initPromise) {
    _initPromise = loadWithRetry().then((db) => {
      _db = db;
      return db;
    });
  }
  return _initPromise;
}
