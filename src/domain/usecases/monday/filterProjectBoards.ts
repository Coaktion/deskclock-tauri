import type { MondayBoardRef } from "@shared/types/monday";

/**
 * A pasta "Projetos" convive com as cópias de template usadas para clonar novos
 * projetos e com os boards auxiliares de subitens. Nenhum dos dois é projeto.
 */
const EXCLUDED_PREFIXES = ["template ", "subitems of ", "subelementos de "];

/**
 * Enumera os boards que representam projetos reais.
 *
 * `folderId` é opcional porque o `folders()` do Monday pode vir vazio conforme o
 * token/permissão — sem ele caímos apenas nos filtros de nome e estado.
 */
export function filterProjectBoards(boards: MondayBoardRef[], folderId?: string): MondayBoardRef[] {
  return boards.filter((board) => {
    if (board.state !== "active") return false;
    if (folderId && board.folderId !== folderId) return false;
    const name = board.name.trim().toLowerCase();
    return !EXCLUDED_PREFIXES.some((prefix) => name.startsWith(prefix));
  });
}
