import type {
  MondayUser,
  MondayWorkspace,
  MondayFolder,
  MondayBoardRef,
  MondayBoardSchema,
  MondayItem,
  MondayItemRef,
} from "@shared/types/monday";
import type { IMondayApi, ListItemsOptions } from "@domain/integrations/IMondayApi";
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

interface RawItem {
  id: string;
  name: string;
  url: string;
  created_at: string;
  group: { id: string; title: string } | null;
  column_values: { id: string; type: string; text: string | null; value: string | null }[];
}

/** Retorno das mutations de item: o grupo vem aninhado, não como id solto. */
interface RawItemRef {
  id: string | number;
  state?: string;
  group?: { id: string } | null;
}

interface RawItemsPage {
  cursor: string | null;
  items: RawItem[];
}

/** Seleção compartilhada entre a primeira página e as seguintes. */
const ITEM_FIELDS = `id name url created_at group { id title }`;

/**
 * Teto de páginas. Existe para que um cursor que nunca zera não vire laço
 * infinito — 100 itens por página cobrem qualquer grupo Activities real com
 * folga.
 */
const MAX_ITEM_PAGES = 50;

/**
 * Boards por requisição. Uma consulta com todos os boards mapeados de uma vez
 * seria a mais econômica em rede, mas a complexidade cresce com o número de
 * boards e o Monday recusa a query inteira ao estourar o orçamento — o lote
 * troca uma recusa por algumas requisições.
 */
const BOARD_BATCH = 20;

interface ItemsQueryRule {
  column_id: string;
  compare_value: string[];
  operator: "any_of" | "not_any_of";
}

/**
 * Traduz as opções de busca para as regras de `query_params`.
 *
 * A coluna de pessoa espera `person-<id>` como valor de comparação — mandar só
 * o id devolve zero itens, sem erro nenhum para avisar.
 */
function buildItemRules({ groupIds, excludeGroupIds, owner }: ListItemsOptions): ItemsQueryRule[] {
  const rules: ItemsQueryRule[] = [];
  if (owner) {
    rules.push({
      column_id: owner.columnId,
      compare_value: [`person-${owner.personId}`],
      operator: "any_of",
    });
  }
  if (groupIds && groupIds.length > 0) {
    rules.push({ column_id: "group", compare_value: groupIds, operator: "any_of" });
  }
  if (excludeGroupIds && excludeGroupIds.length > 0) {
    rules.push({ column_id: "group", compare_value: excludeGroupIds, operator: "not_any_of" });
  }
  return rules;
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

  async listBoardSchemas(boardIds: string[]): Promise<MondayBoardSchema[]> {
    const ids = [...new Set(boardIds.filter(Boolean))];
    const all: MondayBoardSchema[] = [];
    for (let i = 0; i < ids.length; i += BOARD_BATCH) {
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
        { ids: ids.slice(i, i + BOARD_BATCH) }
      );
      all.push(...(data.boards ?? []).map(toBoardSchema));
    }
    return all;
  }

  async getBoardSchema(boardId: string): Promise<MondayBoardSchema> {
    const [schema] = await this.listBoardSchemas([boardId]);
    if (!schema) throw new MondayValidationError(`Board ${boardId} não encontrado no Monday.`);
    return schema;
  }

  async listItems(boardIds: string[], options: ListItemsOptions = {}): Promise<MondayItem[]> {
    const ids = [...new Set(boardIds.filter(Boolean))];
    const all: MondayItem[] = [];
    for (let i = 0; i < ids.length; i += BOARD_BATCH) {
      all.push(...(await this.listItemsBatch(ids.slice(i, i + BOARD_BATCH), options)));
    }
    return all;
  }

  /** Uma requisição para o lote inteiro de boards, mais as páginas que sobrarem. */
  private async listItemsBatch(
    boardIds: string[],
    options: ListItemsOptions
  ): Promise<MondayItem[]> {
    const { columnIds } = options;
    const rules = buildItemRules(options);
    // `column_values(ids:)` só entra quando há filtro: passar a lista vazia
    // devolveria zero colunas em vez de todas. Id de coluna que não existe no
    // board é ignorado pelo Monday, então a união entre boards é segura.
    const columnsField = columnIds
      ? `column_values(ids: $columnIds) { id type text value }`
      : `column_values { id type text value }`;
    const columnsVar = columnIds ? `, $columnIds: [String!]` : "";
    // As regras vão como variável tipada; sem elas, `query_params` fica fora da
    // query — `{rules: []}` traria zero itens em vez de todos.
    const params = rules.length > 0 ? `, query_params: {rules: $rules}` : "";
    const rulesVar = rules.length > 0 ? `, $rules: [ItemsQueryRule!]` : "";

    const first = await this.request<{
      boards: ({ id: string | number; items_page: RawItemsPage } | null)[] | null;
    }>(
      `query ($ids: [ID!], $limit: Int!${rulesVar}${columnsVar}) {
         boards(ids: $ids) {
           id
           items_page(limit: $limit${params}) {
             cursor items { ${ITEM_FIELDS} ${columnsField} }
           }
         }
       }`,
      {
        ids: boardIds,
        limit: PAGE_SIZE,
        ...(rules.length > 0 ? { rules } : {}),
        ...(columnIds ? { columnIds } : {}),
      }
    );

    const all: MondayItem[] = [];
    // O cursor é por board e já carrega o escopo da consulta que o gerou, então
    // `next_items_page` não repete regra nem filtro de coluna.
    const pending: { boardId: string; cursor: string }[] = [];

    for (const board of first.boards ?? []) {
      if (!board) continue;
      const boardId = String(board.id);
      all.push(...board.items_page.items.map((item) => toItem(item, boardId)));
      if (board.items_page.cursor) pending.push({ boardId, cursor: board.items_page.cursor });
    }

    for (let pages = 1; pending.length > 0 && pages < MAX_ITEM_PAGES; pages++) {
      const { boardId, cursor } = pending.shift()!;
      const next = await this.request<{ next_items_page: RawItemsPage | null }>(
        `query ($limit: Int!, $cursor: String!${columnsVar}) {
           next_items_page(limit: $limit, cursor: $cursor) {
             cursor items { ${ITEM_FIELDS} ${columnsField} }
           }
         }`,
        { limit: PAGE_SIZE, cursor, ...(columnIds ? { columnIds } : {}) }
      );
      if (!next.next_items_page) continue;
      all.push(...next.next_items_page.items.map((item) => toItem(item, boardId)));
      if (next.next_items_page.cursor) {
        pending.push({ boardId, cursor: next.next_items_page.cursor });
      }
    }

    return all;
  }

  async createItem(
    boardId: string,
    groupId: string,
    itemName: string,
    columnValues: Record<string, unknown>
  ): Promise<MondayItemRef> {
    const data = await this.request<{ create_item: RawItemRef | null }>(
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
    const data = await this.request<{ change_multiple_column_values: RawItemRef | null }>(
      `mutation ($boardId: ID!, $itemId: ID!, $columnValues: JSON!) {
         change_multiple_column_values(
           board_id: $boardId
           item_id: $itemId
           column_values: $columnValues
           create_labels_if_missing: false
         ) { id state group { id } }
       }`,
      { boardId, itemId, columnValues: JSON.stringify(columnValues) }
    );
    const updated = data.change_multiple_column_values;
    if (!updated) throw new MondayValidationError("O Monday não retornou o item atualizado.");
    // `state` e `group` saem de graça no retorno que o Monday já monta: o
    // primeiro revela o item na lixeira, que aceita a escrita sem erro nenhum; o
    // segundo, a atividade que precisa mudar de grupo porque o Report Type dela
    // mudou — escrita de coluna não move item.
    return {
      id: String(updated.id),
      ...(updated.state ? { state: updated.state } : {}),
      ...(updated.group?.id ? { groupId: String(updated.group.id) } : {}),
    };
  }

  async moveItemToGroup(itemId: string, groupId: string): Promise<void> {
    await this.request<{ move_item_to_group: RawItemRef | null }>(
      `mutation ($itemId: ID!, $groupId: String!) {
         move_item_to_group(item_id: $itemId, group_id: $groupId) { id }
       }`,
      { itemId, groupId }
    );
  }

  async deleteItem(itemId: string): Promise<void> {
    await this.request<{ delete_item: RawItemRef | null }>(
      `mutation ($itemId: ID!) {
         delete_item(item_id: $itemId) { id }
       }`,
      { itemId }
    );
  }
}

function toBoardSchema(raw: RawBoardSchema): MondayBoardSchema {
  return {
    id: String(raw.id),
    name: raw.name,
    groups: raw.groups ?? [],
    columns: (raw.columns ?? []).map((c) => ({
      id: c.id,
      title: c.title,
      type: c.type,
      ...(c.settings_str ? { settingsStr: c.settings_str } : {}),
    })),
    views: (raw.views ?? []).map((v) => ({
      id: String(v.id),
      name: v.name,
      type: v.type,
      ...(v.settings_str ? { settingsStr: v.settings_str } : {}),
    })),
  };
}

function toItem(raw: RawItem, boardId: string): MondayItem {
  return {
    id: String(raw.id),
    name: raw.name,
    url: raw.url,
    boardId,
    groupId: raw.group?.id ?? "",
    groupTitle: raw.group?.title ?? "",
    createdAt: raw.created_at,
    columnValues: (raw.column_values ?? []).map((c) => ({
      id: c.id,
      type: c.type,
      text: c.text,
      value: c.value,
    })),
  };
}

function toBoardRef(raw: RawBoardRef): MondayBoardRef {
  return {
    id: String(raw.id),
    name: raw.name,
    folderId: raw.board_folder_id == null ? null : String(raw.board_folder_id),
    state: raw.state,
  };
}
