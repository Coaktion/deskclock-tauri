import Database from "@tauri-apps/plugin-sql";
import { invoke } from "@tauri-apps/api/core";
import { isRetriableDbLoadError } from "./dbLoadErrors";

let _db: Database | null = null;
let _initPromise: Promise<Database> | null = null;

const DB_URL = import.meta.env.DEV ? "sqlite:deskclock-dev.db" : "sqlite:deskclock.db";

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

// Encaminha uma mensagem ao log do backend (tauri-plugin-log). Best-effort: o
// frontend não escreve no arquivo de log diretamente. Ver commands::log_frontend.
async function logToBackend(
  level: "warn" | "error",
  context: string,
  message: string
): Promise<void> {
  try {
    await invoke("log_frontend", { level, context, message });
  } catch {
    // logging não pode mascarar nem interromper o fluxo de carga do banco.
  }
}

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
        // Logar o retry torna visível uma corrida que se recupera — que de outra
        // forma não deixaria rastro algum no log.
        await logToBackend("warn", "db-load", `tentativa ${i + 1}/${retries} falhou: ${err}`);
        await sleep(delayMs * (i + 1));
        continue;
      }
      break;
    }
  }
  // Falha final: em release este é o único registro visível da falha de carga.
  await logToBackend("error", "db-load", `carga do banco falhou: ${lastErr}`);
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
