import type {
  MondayUser,
  MondayWorkspace,
  MondayFolder,
  MondayBoardRef,
  MondayBoardSchema,
  MondayItemRef,
} from "@shared/types/monday";
import type { IMondayApi } from "@domain/integrations/IMondayApi";
import {
  MondayAuthError,
  MondayNetworkError,
  MondayNotFoundError,
  MondayRateLimitError,
  MondayValidationError,
} from "./errors";

const BASE_URL = "https://api.monday.com/v2";
const API_VERSION = "2024-10";
const PAGE_SIZE = 100;

interface GraphQLResponse<T> {
  data?: T;
  errors?: { message: string }[];
  error_code?: string;
  error_message?: string;
}

interface RawBoardRef {
  id: string;
  name: string;
  state: string;
  board_folder_id: string | number | null;
}

interface RawColumn {
  id: string;
  title: string;
  type: string;
  settings_str?: string | null;
}

interface RawView {
  id: string;
  name: string;
  type: string;
  settings_str?: string | null;
}

interface RawBoardSchema extends RawBoardRef {
  groups: { id: string; title: string }[];
  columns: RawColumn[];
  views: RawView[];
}

export class MondayClient implements IMondayApi {
  constructor(private readonly apiKey: string) {}

  private async request<T>(query: string, variables: Record<string, unknown> = {}): Promise<T> {
    let res: Response;
    try {
      res = await fetch(BASE_URL, {
        method: "POST",
        headers: {
          Authorization: this.apiKey,
          "Content-Type": "application/json",
          "API-Version": API_VERSION,
        },
        body: JSON.stringify({ query, variables }),
      });
    } catch (err) {
      throw new MondayNetworkError(err);
    }

    if (res.status === 401 || res.status === 403) throw new MondayAuthError();
    if (res.status === 429) throw new MondayRateLimitError();

    const body = (await res.json().catch(() => ({}))) as GraphQLResponse<T>;

    if (!res.ok && !body.errors && !body.error_message) {
      throw new MondayValidationError(`Erro HTTP ${res.status} no Monday.`);
    }

    // O Monday responde 200 mesmo em erro de autenticação/complexidade — o
    // discriminador está no corpo, não no status.
    const message = body.error_message ?? body.errors?.map((e) => e.message).join("; ");
    if (message) {
      if (/unauthorized|not authenticated|invalid token/i.test(message)) {
        throw new MondayAuthError(message);
      }
      if (/complexity|rate limit|budget exhausted/i.test(message)) {
        throw new MondayRateLimitError();
      }
      // Distinguido do erro genérico porque é o único caso em que recriar o item
      // é seguro — nos demais o item existe e recriar duplicaria o apontamento.
      if (
        body.error_code === "ResourceNotFoundException" ||
        /not found|does not exist|no such item/i.test(message)
      ) {
        throw new MondayNotFoundError(message);
      }
      throw new MondayValidationError(message);
    }

    if (!body.data) throw new MondayValidationError("Resposta vazia do Monday.");
    return body.data;
  }

  async getMe(): Promise<MondayUser> {
    const data = await this.request<{ me: MondayUser }>(`query { me { id name email } }`);
    return data.me;
  }

  async listWorkspaces(): Promise<MondayWorkspace[]> {
    const all: MondayWorkspace[] = [];
    let page = 1;
    for (;;) {
      const data = await this.request<{ workspaces: MondayWorkspace[] | null }>(
        `query ($limit: Int!, $page: Int!) {
           workspaces(limit: $limit, page: $page) { id name }
         }`,
        { limit: PAGE_SIZE, page }
      );
      const chunk = data.workspaces ?? [];
      all.push(...chunk);
      if (chunk.length < PAGE_SIZE) break;
      page++;
    }
    return all;
  }

  async listFolders(workspaceId: string): Promise<MondayFolder[]> {
    const data = await this.request<{ folders: MondayFolder[] | null }>(
      `query ($workspaceIds: [ID!], $limit: Int!) {
         folders(workspace_ids: $workspaceIds, limit: $limit) { id name }
       }`,
      { workspaceIds: [workspaceId], limit: PAGE_SIZE }
    );
    return data.folders ?? [];
  }

  async listBoards(workspaceId: string): Promise<MondayBoardRef[]> {
    const all: MondayBoardRef[] = [];
    let page = 1;
    for (;;) {
      const data = await this.request<{ boards: RawBoardRef[] | null }>(
        `query ($workspaceIds: [ID!], $limit: Int!, $page: Int!) {
           boards(workspace_ids: $workspaceIds, limit: $limit, page: $page) {
             id name state board_folder_id
           }
         }`,
        { workspaceIds: [workspaceId], limit: PAGE_SIZE, page }
      );
      const chunk = data.boards ?? [];
      all.push(...chunk.map(toBoardRef));
      if (chunk.length < PAGE_SIZE) break;
      page++;
    }
    return all;
  }

  async getBoardSchema(boardId: string): Promise<MondayBoardSchema> {
    const data = await this.request<{ boards: RawBoardSchema[] | null }>(
      `query ($ids: [ID!]) {
         boards(ids: $ids) {
           id
           name
           state
           board_folder_id
           groups { id title }
           columns { id title type settings_str }
           views { id name type settings_str }
         }
       }`,
      { ids: [boardId] }
    );
    const board = data.boards?.[0];
    if (!board) throw new MondayValidationError(`Board ${boardId} não encontrado no Monday.`);
    return {
      id: String(board.id),
      name: board.name,
      groups: board.groups ?? [],
      columns: (board.columns ?? []).map((c) => ({
        id: c.id,
        title: c.title,
        type: c.type,
        ...(c.settings_str ? { settingsStr: c.settings_str } : {}),
      })),
      views: (board.views ?? []).map((v) => ({
        id: String(v.id),
        name: v.name,
        type: v.type,
        ...(v.settings_str ? { settingsStr: v.settings_str } : {}),
      })),
    };
  }

  async createItem(
    boardId: string,
    groupId: string,
    itemName: string,
    columnValues: Record<string, unknown>
  ): Promise<MondayItemRef> {
    const data = await this.request<{ create_item: MondayItemRef | null }>(
      `mutation ($boardId: ID!, $groupId: String!, $itemName: String!, $columnValues: JSON!) {
         create_item(
           board_id: $boardId
           group_id: $groupId
           item_name: $itemName
           column_values: $columnValues
           create_labels_if_missing: false
         ) { id }
       }`,
      { boardId, groupId, itemName, columnValues: JSON.stringify(columnValues) }
    );
    if (!data.create_item) throw new MondayValidationError("O Monday não retornou o item criado.");
    return { id: String(data.create_item.id) };
  }

  async changeColumnValues(
    boardId: string,
    itemId: string,
    columnValues: Record<string, unknown>
  ): Promise<MondayItemRef> {
    const data = await this.request<{ change_multiple_column_values: MondayItemRef | null }>(
      `mutation ($boardId: ID!, $itemId: ID!, $columnValues: JSON!) {
         change_multiple_column_values(
           board_id: $boardId
           item_id: $itemId
           column_values: $columnValues
           create_labels_if_missing: false
         ) { id }
       }`,
      { boardId, itemId, columnValues: JSON.stringify(columnValues) }
    );
    const updated = data.change_multiple_column_values;
    if (!updated) throw new MondayValidationError("O Monday não retornou o item atualizado.");
    return { id: String(updated.id) };
  }

  async deleteItem(itemId: string): Promise<void> {
    await this.request<{ delete_item: MondayItemRef | null }>(
      `mutation ($itemId: ID!) {
         delete_item(item_id: $itemId) { id }
       }`,
      { itemId }
    );
  }
}

function toBoardRef(raw: RawBoardRef): MondayBoardRef {
  return {
    id: String(raw.id),
    name: raw.name,
    folderId: raw.board_folder_id == null ? null : String(raw.board_folder_id),
    state: raw.state,
  };
}
