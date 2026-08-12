import Database from "@tauri-apps/plugin-sql";
import { invoke } from "@tauri-apps/api/core";
import { isRetriableDbLoadError } from "./dbLoadErrors";

let _db: Database | null = null;
let _initPromise: Promise<Database> | null = null;

// Onde conectar e qual schema esperar vêm do Rust — que é quem migra, e a única
// decisão dev/produção do projeto. Derivar o nome do arquivo aqui de novo (por
// `import.meta.env.DEV`) abriria a chance de o frontend ler um banco e a migração
// do boot escrever em outro; `tauri build --debug` já os faz divergir.
interface DbBootstrap {
  url: string;
  expectedVersion: number;
}

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

// Contenção de lock: as 4 janelas do boot conectam ao mesmo SQLite quase juntas e
// o driver pode devolver "database is locked" antes de qualquer uma abrir. É
// transitório — re-tentar com backoff resolve. Erros de checksum de migration não
// entram mais aqui: sem migração no load, eles deixaram de ser transitórios (ver
// dbLoadErrors.ts).
async function loadWithRetry(url: string, retries = 8, delayMs = 150): Promise<Database> {
  let lastErr: unknown = null;
  for (let i = 0; i < retries; i++) {
    try {
      return await Database.load(url);
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

// Confere que o banco em que acabamos de conectar é o que o boot migrou. Pega o
// caso que custou caro: migrar um arquivo e ler outro — aí este banco fica atrás
// da versão esperada e nenhuma tela deve rodar contra ele.
async function assertSchemaUpToDate(db: Database, expectedVersion: number): Promise<void> {
  let applied: number;
  try {
    const rows = await db.select<{ version: number }[]>(
      "SELECT COALESCE(MAX(version), 0) AS version FROM _sqlx_migrations WHERE success = 1"
    );
    applied = rows[0]?.version ?? 0;
  } catch (err) {
    throw new Error(`Não foi possível verificar a versão do banco de dados: ${err}`);
  }

  if (applied < expectedVersion) {
    const message =
      `O banco de dados está na versão ${applied}, mas esta versão do DeskClock ` +
      `espera a ${expectedVersion}. As migrations não foram aplicadas.`;
    await logToBackend("error", "db-schema", message);
    throw new Error(message);
  }
}

export async function getDb(): Promise<Database> {
  if (_db) return _db;
  if (!_initPromise) {
    _initPromise = (async () => {
      // Erro aqui significa que a migração do boot falhou: o Rust guardou o motivo
      // e o devolve no lugar da URL. Propagar é o comportamento certo — nenhuma
      // tela deve abrir um banco que o boot não conseguiu atualizar.
      const bootstrap = await invoke<DbBootstrap>("get_db_bootstrap");
      const db = await loadWithRetry(bootstrap.url);
      await assertSchemaUpToDate(db, bootstrap.expectedVersion);
      _db = db;
      return db;
    })();
  }
  return _initPromise;
}
