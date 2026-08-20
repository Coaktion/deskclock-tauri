import { describe, it, expect, vi, beforeEach } from "vitest";

const mockDb = {
  select: vi.fn(),
  execute: vi.fn(),
};

vi.mock("@infra/database/db", () => ({
  getDb: vi.fn(async () => mockDb),
}));

const { MondayActivityItemRepository } =
  await import("@infra/database/MondayActivityItemRepository");

const BOARD = "b1";
const DAY = "2026-07-30";
const SIGNATURE = "b1::2026-07-30::Tarefa|proj-1|cat-1";

function row(overrides: Record<string, unknown> = {}) {
  return {
    board_id: BOARD,
    item_id: "99",
    signature: SIGNATURE,
    day_iso: DAY,
    task_ids: JSON.stringify(["t1", "t2"]),
    payload: '{"numeric":"1.83"}',
    ...overrides,
  };
}

describe("MondayActivityItemRepository", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDb.select.mockResolvedValue([]);
    mockDb.execute.mockResolvedValue({ rowsAffected: 1, lastInsertId: 0 });
  });

  describe("findCandidates", () => {
    it("encontra pela assinatura sem varrer o dia", async () => {
      mockDb.select.mockResolvedValueOnce([row()]);
      const repo = new MondayActivityItemRepository();

      await expect(repo.findCandidates(BOARD, DAY, SIGNATURE, [])).resolves.toEqual([
        {
          boardId: BOARD,
          itemId: "99",
          signature: SIGNATURE,
          dayISO: DAY,
          taskIds: ["t1", "t2"],
          payload: '{"numeric":"1.83"}',
        },
      ]);
      expect(mockDb.select).toHaveBeenCalledTimes(1);
    });

    it("reencontra o item por interseção de tarefas quando a assinatura mudou", async () => {
      mockDb.select
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([row({ signature: "assinatura-antiga" })]);
      const repo = new MondayActivityItemRepository();

      const found = await repo.findCandidates(BOARD, DAY, "assinatura-nova", ["t2"]);

      expect(found.map((c) => c.itemId)).toEqual(["99"]);
      expect(mockDb.select).toHaveBeenCalledTimes(2);
    });

    it("devolve todos os candidatos de uma fusão de grupos", async () => {
      mockDb.select
        .mockResolvedValueOnce([row({ item_id: "item-A" })])
        .mockResolvedValueOnce([
          row({ item_id: "item-A" }),
          row({ item_id: "item-B", signature: "outra", task_ids: JSON.stringify(["t3"]) }),
        ]);
      const repo = new MondayActivityItemRepository();

      const found = await repo.findCandidates(BOARD, DAY, SIGNATURE, ["t1", "t3"]);

      expect(found.map((c) => c.itemId)).toEqual(["item-A", "item-B"]);
    });

    it("não repete o item que já veio pela assinatura", async () => {
      mockDb.select.mockResolvedValueOnce([row()]).mockResolvedValueOnce([row()]);
      const repo = new MondayActivityItemRepository();

      const found = await repo.findCandidates(BOARD, DAY, SIGNATURE, ["t1"]);

      expect(found).toHaveLength(1);
    });

    it("ignora itens do mesmo dia sem tarefa em comum", async () => {
      mockDb.select
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([row({ task_ids: JSON.stringify(["outra"]) })]);
      const repo = new MondayActivityItemRepository();

      await expect(repo.findCandidates(BOARD, DAY, "nova", ["t1"])).resolves.toEqual([]);
    });

    it("não varre o dia quando não há ids para cruzar", async () => {
      const repo = new MondayActivityItemRepository();
      await expect(repo.findCandidates(BOARD, DAY, SIGNATURE, [])).resolves.toEqual([]);
      expect(mockDb.select).toHaveBeenCalledTimes(1);
    });

    it("tolera task_ids corrompido em vez de quebrar o envio", async () => {
      mockDb.select.mockResolvedValueOnce([row({ task_ids: "{não é json" })]);
      const repo = new MondayActivityItemRepository();

      await expect(repo.findCandidates(BOARD, DAY, SIGNATURE, ["t1"])).resolves.toMatchObject([
        { itemId: "99", taskIds: [] },
      ]);
    });
  });

  describe("save", () => {
    it("faz upsert por (board_id, item_id) para sobreviver à troca de assinatura", async () => {
      const repo = new MondayActivityItemRepository();
      await repo.save({
        boardId: BOARD,
        itemId: "99",
        signature: SIGNATURE,
        dayISO: DAY,
        taskIds: ["t1", "t2"],
        payload: '{"numeric":"1.83"}',
      });

      const [sql, params] = mockDb.execute.mock.calls[0];
      expect(sql).toContain("ON CONFLICT(board_id, item_id) DO UPDATE");
      expect(sql).toContain("signature = excluded.signature");
      expect(params.slice(0, 6)).toEqual([
        BOARD,
        "99",
        SIGNATURE,
        DAY,
        JSON.stringify(["t1", "t2"]),
        '{"numeric":"1.83"}',
      ]);
    });
  });

  describe("deleteItem", () => {
    it("remove o rastreamento de um item inexistente no Monday", async () => {
      const repo = new MondayActivityItemRepository();
      await repo.deleteItem(BOARD, "99");

      const [sql, params] = mockDb.execute.mock.calls[0];
      expect(sql).toContain("DELETE FROM monday_activity_items");
      expect(params).toEqual([BOARD, "99"]);
    });
  });
});
