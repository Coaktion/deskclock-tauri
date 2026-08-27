import { addDaysISO, formatHistoryDayHeader, todayISO } from "@shared/utils/time";

/** O que as três chaves de `AppConfig` guardam do último resumo gerado. */
export interface DailySummaryCache {
  dateISO: string;
  text: string;
  workspaceId: string;
}

/**
 * O texto guardado ainda serve para este dia e este escopo.
 *
 * A comparação é contra o **último dia com tarefas**, e não contra hoje: numa
 * segunda-feira o último dia trabalhado continua sendo a sexta, e o resumo dela
 * não envelheceu — regenerá-lo gastaria uma requisição para produzir o mesmo
 * parágrafo. O texto vazio nunca vale, ou uma falha antiga passaria por cache.
 */
export function isDailySummaryCacheValid(
  cache: DailySummaryCache,
  dayISO: string,
  workspaceId: string
): boolean {
  return cache.text.trim() !== "" && cache.dateISO === dayISO && cache.workspaceId === workspaceId;
}

/**
 * O título da seção, que diz **de que dia** é o resumo — em geral não é hoje.
 *
 * "Hoje" e "ontem" ganham a palavra porque é assim que se fala do dia recente;
 * mais para trás, a data por extenso é a única forma de situá-lo.
 */
export function dailySummaryTitle(dateISO: string | null, today: string = todayISO()): string {
  if (!dateISO) return "Resumo do dia";
  if (dateISO === today) return "Resumo de hoje";
  if (dateISO === addDaysISO(today, -1)) return "Resumo de ontem";
  // O cabeçalho do Histórico abre a data em maiúscula porque lá ela é o título
  // inteiro; aqui ela entra no meio de uma frase, e a UI é sentence case.
  const header = formatHistoryDayHeader(dateISO);
  return `Resumo de ${header[0].toLowerCase()}${header.slice(1)}`;
}
