// Classificação de erros de carga do banco (Database.load) que valem re-tentar.
// Isolado de db.ts para ser testável sem depender do runtime Tauri.
//
// Duas famílias de erro transitório ocorrem quando várias janelas Tauri carregam
// o mesmo SQLite ao mesmo tempo no boot:
//  - Checksum de migration visto em estado parcial ("previously applied" /
//    "has been modified").
//  - Contenção de lock do SQLite quando janelas concorrentes tentam aplicar a
//    mesma migration pendente ("database is locked" / "busy", SQLITE_BUSY=5,
//    SQLITE_LOCKED=6). Sem re-tentar, a transação da migration sofre rollback e
//    fica sem aplicar — foi a causa da migration 009 não rodar no upgrade 1.9.0.
//
// "unable to open database file" (SQLITE_CANTOPEN) é o único padrão que também
// pode ser permanente (diretório ausente, permissão negada, arquivo corrompido).
// Mantido na lista porque sob contenção no boot o SQLite pode retorná-lo de forma
// transitória; o custo de errar é apenas a latência do backoff (~4s no pior caso)
// antes de falhar — e a falha final agora é logada (ver db.ts), não silenciosa.
const RETRIABLE_LOAD_ERROR_PATTERNS = [
  "previously applied",
  "has been modified",
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
