import type {
  MondayUser,
  MondayWorkspace,
  MondayFolder,
  MondayBoardRef,
  MondayBoardSchema,
  MondayItemRef,
} from "@shared/types/monday";

export interface IMondayApi {
  getMe(): Promise<MondayUser>;
  listWorkspaces(): Promise<MondayWorkspace[]>;
  listFolders(workspaceId: string): Promise<MondayFolder[]>;
  listBoards(workspaceId: string): Promise<MondayBoardRef[]>;
  getBoardSchema(boardId: string): Promise<MondayBoardSchema>;
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
