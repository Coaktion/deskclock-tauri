import Database from "@tauri-apps/plugin-sql";

let _db: Database | null = null;

const DB_URL = import.meta.env.DEV ? "sqlite:deskclock-dev.db" : "sqlite:deskclock.db";

export async function getDb(): Promise<Database> {
  if (!_db) {
    _db = await Database.load(DB_URL);
  }
  return _db;
}
