import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  MondayAuthError,
  MondayNetworkError,
  MondayNotFoundError,
  MondayRateLimitError,
  MondayValidationError,
} from "@infra/integrations/monday/errors";

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

const { MondayClient } = await import("@infra/integrations/monday/MondayClient");

const API_KEY = "test-monday-token";

function makeResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
  } as Response;
}

/** Corpo do último POST, já desserializado. */
function lastBody(): { query: string; variables: Record<string, unknown> } {
  const [, init] = mockFetch.mock.calls[mockFetch.mock.calls.length - 1];
  return JSON.parse(init.body as string);
}

beforeEach(() => {
  mockFetch.mockReset();
});

describe("MondayClient", () => {
  describe("autenticação e erros", () => {
    it("envia Authorization sem Bearer e a versão da API", async () => {
      mockFetch.mockResolvedValue(
        makeResponse({ data: { me: { id: "1", name: "E", email: "e@t" } } })
      );

      await new MondayClient(API_KEY).getMe();

      expect(mockFetch).toHaveBeenCalledWith(
        "https://api.monday.com/v2",
        expect.objectContaining({
          method: "POST",
          headers: expect.objectContaining({
            Authorization: API_KEY,
            "API-Version": expect.any(String),
          }),
        })
      );
    });

    it("lança MondayAuthError em 401", async () => {
      mockFetch.mockResolvedValue(makeResponse({}, 401));
      await expect(new MondayClient(API_KEY).getMe()).rejects.toBeInstanceOf(MondayAuthError);
    });

    it("lança MondayRateLimitError em 429", async () => {
      mockFetch.mockResolvedValue(makeResponse({}, 429));
      await expect(new MondayClient(API_KEY).getMe()).rejects.toBeInstanceOf(MondayRateLimitError);
    });

    it("reconhece erro de autenticação vindo com status 200", async () => {
      mockFetch.mockResolvedValue(
        makeResponse({ error_message: "Not Authenticated", error_code: "Unauthorized" })
      );
      await expect(new MondayClient(API_KEY).getMe()).rejects.toBeInstanceOf(MondayAuthError);
    });

    it("reconhece estouro de complexidade como rate limit", async () => {
      mockFetch.mockResolvedValue(
        makeResponse({ errors: [{ message: "Complexity budget exhausted" }] })
      );
      await expect(new MondayClient(API_KEY).getMe()).rejects.toBeInstanceOf(MondayRateLimitError);
    });

    it("distingue 'não encontrado' do erro genérico", async () => {
      mockFetch.mockResolvedValue(
        makeResponse({ errors: [{ message: "Item not found in board" }] })
      );
      await expect(new MondayClient(API_KEY).getMe()).rejects.toBeInstanceOf(MondayNotFoundError);
    });

    it("reconhece ResourceNotFoundException pelo error_code", async () => {
      mockFetch.mockResolvedValue(
        makeResponse({ error_code: "ResourceNotFoundException", error_message: "gone" })
      );
      await expect(new MondayClient(API_KEY).getMe()).rejects.toBeInstanceOf(MondayNotFoundError);
    });

    it("lança MondayValidationError para os demais erros do GraphQL", async () => {
      mockFetch.mockResolvedValue(makeResponse({ errors: [{ message: "Column not found" }] }));
      await expect(new MondayClient(API_KEY).getMe()).rejects.toThrow(/Column not found/);
    });

    it("lança MondayValidationError quando o corpo vem sem data", async () => {
      mockFetch.mockResolvedValue(makeResponse({}));
      await expect(new MondayClient(API_KEY).getMe()).rejects.toBeInstanceOf(MondayValidationError);
    });

    it("lança MondayNetworkError quando o fetch falha", async () => {
      mockFetch.mockRejectedValue(new Error("offline"));
      await expect(new MondayClient(API_KEY).getMe()).rejects.toBeInstanceOf(MondayNetworkError);
    });
  });

  describe("listBoards", () => {
    it("pagina até a página vir incompleta e normaliza board_folder_id", async () => {
      const fullPage = Array.from({ length: 100 }, (_, i) => ({
        id: i,
        name: `Board ${i}`,
        state: "active",
        board_folder_id: 20715906,
      }));
      mockFetch
        .mockResolvedValueOnce(makeResponse({ data: { boards: fullPage } }))
        .mockResolvedValueOnce(
          makeResponse({
            data: {
              boards: [{ id: 999, name: "Subitems of X", state: "active", board_folder_id: null }],
            },
          })
        );

      const boards = await new MondayClient(API_KEY).listBoards("15505674");

      expect(boards).toHaveLength(101);
      expect(boards[0]).toEqual({
        id: "0",
        name: "Board 0",
        folderId: "20715906",
        state: "active",
      });
      expect(boards[100].folderId).toBeNull();
      expect(mockFetch).toHaveBeenCalledTimes(2);
      expect(lastBody().variables).toMatchObject({ workspaceIds: ["15505674"], page: 2 });
    });

    it("trata boards nulo como lista vazia", async () => {
      mockFetch.mockResolvedValue(makeResponse({ data: { boards: null } }));
      await expect(new MondayClient(API_KEY).listBoards("ws")).resolves.toEqual([]);
    });
  });

  describe("listFolders", () => {
    it("retorna lista vazia quando o token não enxerga pastas", async () => {
      mockFetch.mockResolvedValue(makeResponse({ data: { folders: null } }));
      await expect(new MondayClient(API_KEY).listFolders("ws")).resolves.toEqual([]);
    });
  });

  describe("getBoardSchema", () => {
    it("mapeia settings_str para settingsStr e omite quando ausente", async () => {
      mockFetch.mockResolvedValue(
        makeResponse({
          data: {
            boards: [
              {
                id: 1,
                name: "Projeto",
                state: "active",
                board_folder_id: null,
                groups: [{ id: "g1", title: "Activities" }],
                columns: [
                  { id: "c1", title: "Reported Hours", type: "numbers", settings_str: null },
                  { id: "c2", title: "Status", type: "status", settings_str: '{"labels":{}}' },
                ],
                views: [{ id: 2, name: "Activities", type: "table", settings_str: "{}" }],
              },
            ],
          },
        })
      );

      const schema = await new MondayClient(API_KEY).getBoardSchema("1");

      expect(schema.id).toBe("1");
      expect(schema.columns[0]).toEqual({ id: "c1", title: "Reported Hours", type: "numbers" });
      expect(schema.columns[1].settingsStr).toBe('{"labels":{}}');
      expect(schema.views[0]).toEqual({
        id: "2",
        name: "Activities",
        type: "table",
        settingsStr: "{}",
      });
    });

    it("falha quando o board não existe", async () => {
      mockFetch.mockResolvedValue(makeResponse({ data: { boards: [] } }));
      await expect(new MondayClient(API_KEY).getBoardSchema("404")).rejects.toBeInstanceOf(
        MondayValidationError
      );
    });

    it("listBoardSchemas traz vários boards numa requisição só", async () => {
      // O import precisa do schema de todos os boards mapeados; um por
      // requisição devolveria o problema que a busca em lote resolveu.
      mockFetch.mockResolvedValue(
        makeResponse({
          data: {
            boards: [
              { id: 1, name: "A", groups: [], columns: [], views: [] },
              { id: 2, name: "B", groups: [], columns: [], views: [] },
            ],
          },
        })
      );

      const schemas = await new MondayClient(API_KEY).listBoardSchemas(["1", "2"]);

      expect(mockFetch).toHaveBeenCalledTimes(1);
      expect(lastBody().variables.ids).toEqual(["1", "2"]);
      expect(schemas.map((s) => s.id)).toEqual(["1", "2"]);
    });
  });

  describe("listItems", () => {
    /** Item cru como o Monday devolve dentro de `items_page`. */
    function rawItem(id: string, groupId = "group_mm2e2g9j") {
      return {
        id,
        name: `Item ${id}`,
        url: `https://coaktion.monday.com/boards/1/pulses/${id}`,
        created_at: "2026-07-29T18:40:31Z",
        group: { id: groupId, title: "Activities" },
        column_values: [{ id: "numeric_mm33gj5m", type: "numbers", text: "2", value: '"2"' }],
      };
    }

    function boardsResponse(
      boards: { id: string | number; cursor?: string | null; items: ReturnType<typeof rawItem>[] }[]
    ) {
      return makeResponse({
        data: {
          boards: boards.map((b) => ({
            id: b.id,
            items_page: { cursor: b.cursor ?? null, items: b.items },
          })),
        },
      });
    }

    it("consulta todos os boards numa requisição só", async () => {
      mockFetch.mockResolvedValue(
        boardsResponse([
          { id: "1", items: [rawItem("10")] },
          { id: "2", items: [rawItem("20")] },
        ])
      );

      const items = await new MondayClient(API_KEY).listItems(["1", "2"]);

      expect(mockFetch).toHaveBeenCalledTimes(1);
      expect(lastBody().variables.ids).toEqual(["1", "2"]);
      expect(items.map((i) => i.id)).toEqual(["10", "20"]);
    });

    it("carimba no item o board de origem", async () => {
      // Sem isso a busca em lote não sabe a qual mapeamento o item pertence, e
      // horas de um cliente apareceriam sob o nome de outro.
      mockFetch.mockResolvedValue(
        boardsResponse([
          { id: 1, items: [rawItem("10")] },
          { id: 2, items: [rawItem("20")] },
        ])
      );

      const items = await new MondayClient(API_KEY).listItems(["1", "2"]);

      expect(items.map((i) => i.boardId)).toEqual(["1", "2"]);
    });

    it("filtra o responsável no servidor, com o prefixo person-", async () => {
      // Mandar só o id devolve zero itens, sem erro nenhum para avisar.
      mockFetch.mockResolvedValue(boardsResponse([{ id: "1", items: [] }]));

      await new MondayClient(API_KEY).listItems(["1"], {
        owner: { columnId: "person", personId: "21181483" },
      });

      expect(lastBody().variables.rules).toEqual([
        { column_id: "person", compare_value: ["person-21181483"], operator: "any_of" },
      ]);
    });

    it("inclui e exclui grupos pelas regras da consulta", async () => {
      mockFetch.mockResolvedValue(boardsResponse([{ id: "1", items: [] }]));
      const client = new MondayClient(API_KEY);

      await client.listItems(["1"], { groupIds: ["g1", "g2"] });
      expect(lastBody().variables.rules).toEqual([
        { column_id: "group", compare_value: ["g1", "g2"], operator: "any_of" },
      ]);

      await client.listItems(["1"], { excludeGroupIds: ["g9"] });
      expect(lastBody().variables.rules).toEqual([
        { column_id: "group", compare_value: ["g9"], operator: "not_any_of" },
      ]);
    });

    it("omite query_params quando não há filtro", async () => {
      // `{rules: []}` traria zero itens em vez do board inteiro.
      mockFetch.mockResolvedValue(boardsResponse([{ id: "1", items: [] }]));

      await new MondayClient(API_KEY).listItems(["1"]);

      expect(lastBody().query).not.toContain("query_params");
      expect(lastBody().variables.rules).toBeUndefined();
    });

    it("segue o cursor de cada board até o fim", async () => {
      mockFetch
        .mockResolvedValueOnce(
          boardsResponse([
            { id: "1", cursor: "c1", items: [rawItem("10")] },
            { id: "2", items: [rawItem("20")] },
          ])
        )
        .mockResolvedValueOnce(
          makeResponse({ data: { next_items_page: { cursor: null, items: [rawItem("11")] } } })
        );

      const items = await new MondayClient(API_KEY).listItems(["1", "2"]);

      expect(mockFetch).toHaveBeenCalledTimes(2);
      expect(lastBody().variables.cursor).toBe("c1");
      expect(items.map((i) => i.id)).toEqual(["10", "20", "11"]);
      expect(items.find((i) => i.id === "11")?.boardId).toBe("1");
    });

    it("quebra a consulta em lotes quando há muitos boards", async () => {
      // Complexidade cresce com o número de boards e o Monday recusa a query
      // inteira ao estourar o orçamento.
      mockFetch.mockResolvedValue(boardsResponse([]));
      const ids = Array.from({ length: 21 }, (_, i) => String(i + 1));

      await new MondayClient(API_KEY).listItems(ids);

      expect(mockFetch).toHaveBeenCalledTimes(2);
      expect(lastBody().variables.ids).toEqual(["21"]);
    });

    it("ignora board repetido", async () => {
      mockFetch.mockResolvedValue(boardsResponse([{ id: "1", items: [] }]));

      await new MondayClient(API_KEY).listItems(["1", "1", ""]);

      expect(lastBody().variables.ids).toEqual(["1"]);
    });
  });

  describe("mutations", () => {
    it("createItem serializa column_values como string JSON", async () => {
      mockFetch.mockResolvedValue(makeResponse({ data: { create_item: { id: 555 } } }));

      const result = await new MondayClient(API_KEY).createItem("b1", "g1", "Tarefa", {
        numeric_x: "1.83",
      });

      expect(result).toEqual({ id: "555" });
      const body = lastBody();
      expect(body.query).toContain("create_item");
      expect(body.variables.columnValues).toBe('{"numeric_x":"1.83"}');
      expect(body.variables).toMatchObject({ boardId: "b1", groupId: "g1", itemName: "Tarefa" });
    });

    it("changeColumnValues usa change_multiple_column_values", async () => {
      mockFetch.mockResolvedValue(
        makeResponse({ data: { change_multiple_column_values: { id: 555 } } })
      );

      const result = await new MondayClient(API_KEY).changeColumnValues("b1", "555", { a: 1 });

      expect(result).toEqual({ id: "555" });
      expect(lastBody().query).toContain("change_multiple_column_values");
    });

    it("deleteItem chama a mutation delete_item", async () => {
      mockFetch.mockResolvedValue(makeResponse({ data: { delete_item: { id: "555" } } }));

      await new MondayClient(API_KEY).deleteItem("555");

      const body = lastBody();
      expect(body.query).toContain("delete_item");
      expect(body.variables).toMatchObject({ itemId: "555" });
    });

    it("falha quando a mutation não retorna o item", async () => {
      mockFetch.mockResolvedValue(makeResponse({ data: { create_item: null } }));
      await expect(
        new MondayClient(API_KEY).createItem("b1", "g1", "Tarefa", {})
      ).rejects.toBeInstanceOf(MondayValidationError);
    });
  });
});
