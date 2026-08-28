import type { DaySummary } from "@domain/entities/DaySummary";
import type { UUID } from "@shared/types";

export interface IDaySummaryRepository {
  /**
   * Os resumos que já existem para os dias pedidos, naquele workspace.
   *
   * A consulta é em lote, e não um `findByDay` por dia, porque quem pergunta é
   * a geração de vários dias: N consultas para decidir o que **não** vai virar
   * requisição seriam N idas ao banco para economizar chamadas de rede.
   * Dia sem resumo simplesmente não vem na lista.
   */
  findByDays(workspaceId: UUID, dateISOs: string[]): Promise<DaySummary[]>;
  /**
   * Grava o resumo do dia, substituindo o que houver.
   *
   * Substitui em vez de recusar porque o único caminho que chega aqui é uma
   * geração que o usuário pediu de propósito: se ele mandou gerar de novo, o
   * texto novo é o que ele quer ver.
   */
  save(summary: DaySummary): Promise<void>;
}
