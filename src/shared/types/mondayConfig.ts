export interface MondayWorkspaceRef {
  id: string;
  name: string;
}

/**
 * Ids das colunas do grupo Activities de um board, resolvidos por título no
 * import. São gerados por template (`mmXXXX`) — nunca hardcodar.
 */
export interface MondayActivityColumnIds {
  reportedHours: string;
  billingType: string;
  activityType: string;
  projectStage?: string;
  /** Preenchidas só na criação do item, com o instante do envio. */
  startDate?: string;
  endDate?: string;
  status: string;
  person: string;
}

export interface MondayProjectMapping {
  deskclockProjectId: string;
  mondayBoardId: string;
  mondayBoardName: string;
  /** Grupo "Activities" do board, resolvido pela view homônima no import. */
  activitiesGroupId: string;
  columnIds: MondayActivityColumnIds;
  /**
   * Rótulos da coluna Activity Type, cacheados no import. São eles que viram
   * Categoria no DeskClock — e o envio só grava a coluna quando o nome da
   * categoria da tarefa está nesta lista, porque um rótulo inexistente faz o
   * Monday recusar a escrita inteira.
   */
  activityTypeLabels: string[];
  /** Rótulos da coluna Project Stage; semeiam o campo personalizado. */
  projectStageLabels: string[];
  /** Título da coluna Project Stage no board — nomeia o campo criado. */
  projectStageTitle: string;
  workspaceId: string;
}
