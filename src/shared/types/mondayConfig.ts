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
  activityType: string;
  /**
   * Opcionais porque **nem todo board segue o template inteiro**, e recusar o
   * board por falta delas custava caro: o cliente não virava projeto e as horas
   * não tinham para onde ir. Sem a coluna, o campo simplesmente não entra no
   * payload — nunca mandamos id que o board não tem, o que faria o Monday
   * recusar a escrita inteira (e, pior, responder um "não existe" que o sender
   * lê como item apagado e recria, duplicando a atividade).
   */
  billingType?: string;
  status?: string;
  projectStage?: string;
  /** Preenchidas com o intervalo trabalhado; ver `buildActivityDateColumns`. */
  startDate?: string;
  endDate?: string;
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
