// Classificação de erros de carga do banco (Database.load) que valem re-tentar.
// Isolado de db.ts para ser testável sem depender do runtime Tauri.
//
// `Database.load` hoje só conecta: a migração acontece antes, no boot, do lado do
// Rust (ver src-tauri/src/database.rs). Logo, o único erro transitório que resta é
// a contenção de lock do SQLite, quando as 4 janelas do boot conectam ao mesmo
// arquivo quase juntas ("database is locked" / "busy", SQLITE_BUSY=5,
// SQLITE_LOCKED=6). Sem re-tentar, uma janela abriria sem banco.
//
// "unable to open database file" (SQLITE_CANTOPEN) é o único padrão que também
// pode ser permanente (diretório ausente, permissão negada, arquivo corrompido).
// Mantido na lista porque sob contenção no boot o SQLite pode retorná-lo de forma
// transitória; o custo de errar é apenas a latência do backoff (~4s no pior caso)
// antes de falhar — e a falha final é logada (ver db.ts), não silenciosa.
//
// Erros de checksum de migration ("previously applied", "has been modified") já
// estiveram aqui e saíram de propósito: eram sintoma da corrida de migração no
// load, que não existe mais. Re-tentá-los agora só esconderia um banco de fato
// divergente do binário.
const RETRIABLE_LOAD_ERROR_PATTERNS = [
  "database is locked",
  "database is busy",
  "unable to open database file",
  "(code: 5)",
  "(code: 6)",
];

export function isRetriableDbLoadError(message: string): boolean {
  const normalized = message.toLowerCase();
  return RETRIABLE_LOAD_ERROR_PATTERNS.some((pattern) => normalized.includes(pattern));
}
