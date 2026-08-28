import { MAX_SUMMARY_DAYS } from "@domain/usecases/llm/SummarizeWorkdays";

/**
 * O aviso de que a busca trouxe mais dias do que uma geração resume.
 *
 * Existe porque o corte é silencioso: o lote pega os `MAX_SUMMARY_DAYS` mais
 * recentes e os demais simplesmente não aparecem. Descobrir isso depois, pelos
 * parágrafos que faltam, pareceria falha. Dentro do teto não há o que avisar, e
 * o retorno é `null`.
 */
export function summaryScopeNote(dayCount: number): string | null {
  if (dayCount <= MAX_SUMMARY_DAYS) return null;
  return `A busca trouxe ${dayCount} dias; o resumo cobre os ${MAX_SUMMARY_DAYS} mais recentes.`;
}

/** O andamento do lote, escrito enquanto ele roda. */
export function summaryProgressLabel(done: number, total: number): string {
  return `Gerando ${Math.min(done + 1, total)} de ${total}…`;
}
