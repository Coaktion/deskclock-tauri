import type { QuickFilter } from "@presentation/hooks/useHistory";

/**
 * O que a tela diz quando a busca não trouxe nada.
 *
 * O genérico não serve para o "Último trabalhado": ali o vazio não significa
 * "os filtros não bateram", significa que **não existe dia anterior a hoje com
 * registro** — e um "nenhum registro encontrado" sobre um filtro que ninguém
 * preencheu lê como defeito do app, não como resposta.
 */
export function emptyResultMessage(quick: QuickFilter): string {
  return quick === "lastDay" ? "Nenhum dia trabalhado antes de hoje" : "Nenhum registro encontrado";
}
