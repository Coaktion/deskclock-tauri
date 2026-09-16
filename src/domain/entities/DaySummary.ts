import type { UUID } from "@shared/types";

/**
 * O resumo, gerado pelo provedor de IA, de um dia de trabalho.
 *
 * É fato que não muda: o dia acabou e as tarefas dele também. Por isso ele é
 * guardado — reger um dia já resumido gastaria cota para produzir o mesmo
 * parágrafo, e é essa economia que torna suportável o teto de dias por geração.
 */
export interface DaySummary {
  /** Dia local (AAAA-MM-DD) resumido, não o dia em que se gerou. */
  dateISO: string;
  workspaceId: UUID;
  summary: string;
  /** Instante da geração — é o que distingue um resumo antigo de um recém-feito. */
  generatedAt: string;
}
