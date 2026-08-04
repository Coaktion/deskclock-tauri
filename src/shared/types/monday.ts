/** DTOs da API GraphQL do Monday.com (https://api.monday.com/v2). */

export interface MondayUser {
  id: string;
  name: string;
  email: string;
}

export interface MondayWorkspace {
  id: string;
  name: string;
}

export interface MondayFolder {
  id: string;
  name: string;
}

export interface MondayBoardRef {
  id: string;
  name: string;
  /** `board_folder_id` — null para boards fora de pasta (ex: "Subitems of …"). */
  folderId: string | null;
  state: string;
}

export interface MondayColumn {
  id: string;
  title: string;
  /** Tipo do Monday: "numbers", "status", "people", "text"… */
  type: string;
  /** JSON cru com labels de colunas `status`/`color`. */
  settingsStr?: string;
}

export interface MondayGroup {
  id: string;
  title: string;
}

export interface MondayView {
  id: string;
  name: string;
  type: string;
  /** JSON cru com as regras da view (inclui o grupo filtrado). */
  settingsStr?: string;
}

export interface MondayBoardSchema {
  id: string;
  name: string;
  groups: MondayGroup[];
  columns: MondayColumn[];
  views: MondayView[];
}

export interface MondayItemRef {
  id: string;
  /**
   * `active` | `archived` | `deleted`. Item apagado no Monday vai para a
   * **lixeira** e continua endereçável pelo id — mutações nele respondem
   * sucesso. Sem olhar o estado, uma atividade apagada por lá seria atualizada
   * dentro da lixeira para sempre, sem nunca voltar ao board.
   */
  state?: string;
}

/**
 * Valor cru de uma coluna, como o Monday devolve em `column_values`.
 *
 * `text` é a representação já formatada pelo Monday e serve para exibir; `value`
 * é o JSON com a estrutura completa e é o único caminho confiável para datas e
 * timelines, cujo `text` perde o fuso e o dia final.
 */
export interface MondayColumnValue {
  id: string;
  type: string;
  text: string | null;
  value: string | null;
}

export interface MondayItem {
  id: string;
  name: string;
  /** Permalink do item, usado como ação "abrir no Monday". */
  url: string;
  /** Board de origem — a busca cobre vários de uma vez e o item precisa saber. */
  boardId: string;
  groupId: string;
  groupTitle: string;
  createdAt: string;
  columnValues: MondayColumnValue[];
}
