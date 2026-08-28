import { MAX_SUMMARY_DAYS } from "@domain/usecases/llm/SummarizeWorkdays";

/**
 * O que o botão diz **antes** do clique.
 *
 * O número vai no rótulo porque cada dia é uma requisição paga contra a cota do
 * provedor, e um "Gerar" sem quantidade esconde justamente o que custa. Quando a
 * busca traz mais dias que o teto, o rótulo diz que só os mais recentes entram —
 * descobrir isso depois, pelos parágrafos que faltam, pareceria falha.
 */
export function summaryButtonLabel(dayCount: number): string {
  if (dayCount > MAX_SUMMARY_DAYS) return `Gerar resumo dos ${MAX_SUMMARY_DAYS} dias mais recentes`;
  return dayCount === 1 ? "Gerar resumo de 1 dia" : `Gerar resumo de ${dayCount} dias`;
}

/** O andamento do lote, escrito enquanto ele roda. */
export function summaryProgressLabel(done: number, total: number): string {
  return `Gerando ${Math.min(done + 1, total)} de ${total}…`;
}
