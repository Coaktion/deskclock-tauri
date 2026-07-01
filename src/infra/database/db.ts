import Database from "@tauri-apps/plugin-sql";
import { invoke } from "@tauri-apps/api/core";
import { isRetriableDbLoadError } from "./dbLoadErrors";

let _db: Database | null = null;
let _initPromise: Promise<Database> | null = null;

const DB_URL = import.meta.env.DEV ? "sqlite:deskclock-dev.db" : "sqlite:deskclock.db";

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

// Race condition: quando várias janelas Tauri carregam o banco ao mesmo tempo no
// boot, as chamadas concorrentes de Database.load() disputam o lock do SQLite e
// podem ver o _sqlx_migrations em estado parcial. Ambos os sintomas (checksum e
// "database is locked") são transitórios — re-tentar com backoff deixa a janela
// vencedora terminar de aplicar a migration. Ver dbLoadErrors.ts para o racional.
async function loadWithRetry(retries = 8, delayMs = 150): Promise<Database> {
  let lastErr: unknown = null;
  for (let i = 0; i < retries; i++) {
    try {
      return await Database.load(DB_URL);
    } catch (err) {
      lastErr = err;
      if (i < retries - 1 && isRetriableDbLoadError(String(err))) {
        await sleep(delayMs * (i + 1));
        continue;
      }
      break;
    }
  }
  // Persistir a falha final. Em build de release este é o único registro visível:
  // o tauri-plugin-log só escreve em arquivo pelo lado Rust.
  try {
    await invoke("log_frontend_error", { context: "db-load", message: String(lastErr) });
  } catch {
    // logging é best-effort — não mascarar o erro original de carga do banco.
  }
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
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
