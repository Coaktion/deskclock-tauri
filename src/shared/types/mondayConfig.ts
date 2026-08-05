/**
 * Como o projeto se classifica, pela coluna "Oferta" do Portfólio.
 *
 * Não é rótulo: decide o conjunto de Activity Type válido no board de destino
 * (21 rótulos em cliente, 14 em interno, só `N-A` em comum) e se o Project
 * Stage entra no payload. Rótulo do conjunto errado faz o Monday recusar a
 * mutation inteira, então errar aqui não degrada o envio — derruba.
 */
export type MondayProjectScope = "cliente" | "interno";

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
  /** Item do board de Portfólio que originou o projeto. */
  portfolioItemId: string;
  /**
   * Board onde as horas são gravadas, vindo da coluna "ID Quadro Projeto" do
   * item de Portfólio.
   *
   * **Vazio é um estado normal**, não um erro: 14 dos 62 itens do Portfólio
   * ainda não têm a coluna preenchida. O projeto existe, aparece na tela e pode
   * receber tarefas — só as horas não sobem. Recusar o item por causa disso
   * deixaria o cliente sem Project e sem caminho nenhum para lançar aquelas
   * horas; a tela de Integrações oferece o campo para preencher à mão.
   */
  mondayBoardId: string;
  mondayBoardName: string;
  scope: MondayProjectScope;
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
}
