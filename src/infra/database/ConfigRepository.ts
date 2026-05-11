import { getDb } from "./db";
import type { IConfigRepository } from "@domain/repositories/IConfigRepository";

interface ConfigRow {
  key: string;
  value: string;
}

export class ConfigRepository implements IConfigRepository {
  async get<T>(key: string, defaultValue: T): Promise<T> {
    const db = await getDb();
    const rows = await db.select<ConfigRow[]>("SELECT value FROM config WHERE key = $1", [key]);
    if (!rows[0]) return defaultValue;
    try {
      return JSON.parse(rows[0].value) as T;
    } catch {
      return defaultValue;
    }
  }

  async loadAll(): Promise<Record<string, unknown>> {
    const db = await getDb();
    const rows = await db.select<ConfigRow[]>("SELECT key, value FROM config");
    const result: Record<string, unknown> = {};
    for (const row of rows) {
      try {
        result[row.key] = JSON.parse(row.value);
      } catch {
        // valor corrompido — ConfigProvider usará o default para esta chave
      }
    }
    return result;
  }

  async set<T>(key: string, value: T): Promise<void> {
    const db = await getDb();
    await db.execute(
      "INSERT INTO config (key, value) VALUES ($1, $2) ON CONFLICT(key) DO UPDATE SET value = $2",
      [key, JSON.stringify(value)]
    );
  }

  async delete(key: string): Promise<void> {
    const db = await getDb();
    await db.execute("DELETE FROM config WHERE key = $1", [key]);
  }
}
