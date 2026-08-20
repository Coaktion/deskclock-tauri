import type { MondayItemPeriod } from "@domain/usecases/monday/mondayItemPeriod";
import type { UUID } from "@shared/types";

/**
 * Como o item estava no Monday no último sync.
 *
 * É a comparação com este retrato — e não com a planejada — que distingue "o
 * item mudou lá" de "eu editei aqui". Sem ele, refletir o Monday significaria
 * reescrever a planejada inteira a cada ciclo, desfazendo toda edição local.
 */
export interface MondayItemSnapshot {
  name: string;
  /** Da coluna Timeline; nulo quando ninguém a preencheu no board. */
  period: MondayItemPeriod | null;
  /** Rótulo da coluna Activity Type — é ele que vira Categoria. */
  activityTypeLabel: string;
  /** Rótulo da coluna Project Stage — é ele que vira a opção do campo. */
  projectStageLabel: string;
}

/** Vínculo entre um item do Monday e a tarefa planejada que ele gerou aqui. */
export interface TrackedMondayItem {
  mondayItemId: string;
  /**
   * Workspace do DeskClock em que a planejada nasceu. Compõe a chave porque um
   * mesmo board pode estar mapeado a projetos de dois workspaces.
   */
  workspaceId: UUID;
  boardId: string;
  plannedTaskId: UUID;
  snapshot: MondayItemSnapshot;
  importedAt: string;
  updatedAt: string;
}
