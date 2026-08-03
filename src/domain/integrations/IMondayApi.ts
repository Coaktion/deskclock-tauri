import type {
  MondayUser,
  MondayWorkspace,
  MondayFolder,
  MondayBoardRef,
  MondayBoardSchema,
  MondayItem,
  MondayItemRef,
} from "@shared/types/monday";

export interface ListItemsOptions {
  /** Restringe aos grupos indicados — a união entre os boards consultados. */
  groupIds?: string[];
  /** Exclui os grupos indicados. Não combine com `groupIds`. */
  excludeGroupIds?: string[];
  /**
   * Só itens em que esta pessoa é a responsável, filtrado **no servidor**.
   *
   * O id da coluna vem junto porque varia de board para board — é resolvido pelo
   * título no schema e cacheado no mapeamento do projeto.
   */
  owner?: { columnId: string; personId: string };
  /** Reduz o payload às colunas de interesse. Omitido = todas. */
  columnIds?: string[];
}

export interface IMondayApi {
  getMe(): Promise<MondayUser>;
  listWorkspaces(): Promise<MondayWorkspace[]>;
  listFolders(workspaceId: string): Promise<MondayFolder[]>;
  listBoards(workspaceId: string): Promise<MondayBoardRef[]>;
  /**
   * Schemas de vários boards numa requisição.
   *
   * O import precisa do schema de todos os boards mapeados de uma vez — é dele
   * que sai o id da coluna de cronograma, que varia por board e não cabe no
   * mapeamento cacheado.
   */
  listBoardSchemas(boardIds: string[]): Promise<MondayBoardSchema[]>;
  getBoardSchema(boardId: string): Promise<MondayBoardSchema>;
  /**
   * Itens de **vários boards de uma vez**, paginados por cursor até o fim.
   *
   * Recebe a lista inteira, e não um board por chamada, porque ninguém trabalha
   * em todos os clientes: uma busca por board mapeado dispara dezenas de
   * requisições paralelas para descobrir que quase todas voltam vazias. Grupo e
   * responsável são filtrados no servidor pelo mesmo motivo.
   *
   * Sem filtro de período: o Monday não expressa "intervalo que cruza o
   * período" nas regras de `query_params`, e as atividades guardam o intervalo
   * em duas colunas separadas. A janela é aplicada por quem chama, com
   * `periodOverlaps`.
   */
  listItems(boardIds: string[], options?: ListItemsOptions): Promise<MondayItem[]>;
  createItem(
    boardId: string,
    groupId: string,
    itemName: string,
    columnValues: Record<string, unknown>
  ): Promise<MondayItemRef>;
  changeColumnValues(
    boardId: string,
    itemId: string,
    columnValues: Record<string, unknown>
  ): Promise<MondayItemRef>;
  /** Usado quando dois grupos se fundem e o item perdedor precisa sair do board. */
  deleteItem(itemId: string): Promise<void>;
}
