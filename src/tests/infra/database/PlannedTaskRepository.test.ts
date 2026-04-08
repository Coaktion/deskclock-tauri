import { describe, it, expect, vi, beforeEach } from "vitest";
import type { PlannedTask } from "@domain/entities/PlannedTask";

const mockDb = {
  select: vi.fn(),
  execute: vi.fn(),
};

vi.mock("@infra/database/db", () => ({
  getDb: vi.fn(async () => mockDb),
}));

const { PlannedTaskRepository } = await import("@infra/database/PlannedTaskRepository");

function makeRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: "pt1",
    name: "Reunião",
    project_id: null,
    category_id: null,
    billable: 1,
    schedule_type: "specific_date",
    schedule_date: "2026-04-08",
    recurring_days: null,
    period_start: null,
    period_end: null,
    completed_dates: "[]",
    actions: "[]",
    sort_order: 0,
    created_at: "2026-04-08T09:00:00.000Z",
    ...overrides,
  };
}

function makeTask(overrides: Partial<PlannedTask> = {}): PlannedTask {
  return {
    id: "pt1",
    name: "Reunião",
    projectId: null,
    categoryId: null,
    billable: true,
    scheduleType: "specific_date",
    scheduleDate: "2026-04-08",
    recurringDays: null,
    periodStart: null,
    periodEnd: null,
    completedDates: [],
    actions: [],
    sortOrder: 0,
    createdAt: "2026-04-08T09:00:00.000Z",
    ...overrides,
  };
}

describe("PlannedTaskRepository", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDb.select.mockResolvedValue([]);
    mockDb.execute.mockResolvedValue({ rowsAffected: 1, lastInsertId: 0 });
  });

  describe("findById", () => {
    it("retorna tarefa mapeada quando encontrada", async () => {
      mockDb.select.mockResolvedValue([makeRow()]);
      const repo = new PlannedTaskRepository();
      const result = await repo.findById("pt1");
      expect(result).not.toBeNull();
      expect(result?.id).toBe("pt1");
      expect(result?.billable).toBe(true);
    });

    it("converte billable=0 para false", async () => {
      mockDb.select.mockResolvedValue([makeRow({ billable: 0 })]);
      const repo = new PlannedTaskRepository();
      const result = await repo.findById("pt1");
      expect(result?.billable).toBe(false);
    });

    it("retorna null quando não encontrada", async () => {
      mockDb.select.mockResolvedValue([]);
      const repo = new PlannedTaskRepository();
      const result = await repo.findById("inexistente");
      expect(result).toBeNull();
    });

    it("desserializa completed_dates como array", async () => {
      mockDb.select.mockResolvedValue([makeRow({ completed_dates: '["2026-04-07","2026-04-08"]' })]);
      const repo = new PlannedTaskRepository();
      const result = await repo.findById("pt1");
      expect(result?.completedDates).toEqual(["2026-04-07", "2026-04-08"]);
    });

    it("desserializa actions como array", async () => {
      mockDb.select.mockResolvedValue([
        makeRow({ actions: '[{"type":"open_url","value":"https://example.com"}]' }),
      ]);
      const repo = new PlannedTaskRepository();
      const result = await repo.findById("pt1");
      expect(result?.actions).toHaveLength(1);
      expect(result?.actions[0].type).toBe("open_url");
    });

    it("desserializa recurring_days como array de números", async () => {
      mockDb.select.mockResolvedValue([
        makeRow({
          schedule_type: "recurring",
          schedule_date: null,
          recurring_days: "[1,2,3]",
        }),
      ]);
      const repo = new PlannedTaskRepository();
      const result = await repo.findById("pt1");
      expect(result?.recurringDays).toEqual([1, 2, 3]);
    });
  });

  describe("save", () => {
    it("executa INSERT com dados corretos", async () => {
      const repo = new PlannedTaskRepository();
      await repo.save(makeTask());
      expect(mockDb.execute).toHaveBeenCalledWith(
        expect.stringContaining("INSERT"),
        expect.arrayContaining(["pt1", "Reunião"])
      );
    });

    it("serializa arrays como JSON", async () => {
      const repo = new PlannedTaskRepository();
      await repo.save(
        makeTask({
          completedDates: ["2026-04-07"],
          actions: [{ type: "open_url", value: "https://x.com" }],
        })
      );
      const args = mockDb.execute.mock.calls[0][1] as unknown[];
      expect(args).toContain('["2026-04-07"]');
      expect(args).toContain('[{"type":"open_url","value":"https://x.com"}]');
    });

    it("converte billable=true para 1", async () => {
      const repo = new PlannedTaskRepository();
      await repo.save(makeTask({ billable: true }));
      const args = mockDb.execute.mock.calls[0][1] as unknown[];
      expect(args).toContain(1);
    });
  });

  describe("update", () => {
    it("executa UPDATE com dados corretos", async () => {
      const repo = new PlannedTaskRepository();
      await repo.update(makeTask({ name: "Atualizado" }));
      expect(mockDb.execute).toHaveBeenCalledWith(
        expect.stringContaining("UPDATE"),
        expect.arrayContaining(["Atualizado", "pt1"])
      );
    });
  });

  describe("complete", () => {
    it("adiciona data a completed_dates via UPDATE", async () => {
      mockDb.select.mockResolvedValue([makeRow({ completed_dates: "[]" })]);
      const repo = new PlannedTaskRepository();
      await repo.complete("pt1", "2026-04-08");
      expect(mockDb.execute).toHaveBeenCalledWith(
        expect.stringContaining("UPDATE"),
        expect.arrayContaining(["pt1"])
      );
    });

    it("não duplica data já existente", async () => {
      mockDb.select.mockResolvedValue([makeRow({ completed_dates: '["2026-04-08"]' })]);
      const repo = new PlannedTaskRepository();
      await repo.complete("pt1", "2026-04-08");
      const args = mockDb.execute.mock.calls[0][1] as unknown[];
      const datesArg = args.find((a) => typeof a === "string" && a.includes("2026-04-08")) as string;
      const parsed = JSON.parse(datesArg);
      expect(parsed).toHaveLength(1);
    });
  });

  describe("uncomplete", () => {
    it("remove data de completed_dates via UPDATE", async () => {
      mockDb.select.mockResolvedValue([makeRow({ completed_dates: '["2026-04-08"]' })]);
      const repo = new PlannedTaskRepository();
      await repo.uncomplete("pt1", "2026-04-08");
      const args = mockDb.execute.mock.calls[0][1] as unknown[];
      const datesArg = args.find((a) => typeof a === "string" && a.startsWith("[")) as string;
      expect(JSON.parse(datesArg)).toEqual([]);
    });
  });

  describe("delete", () => {
    it("executa DELETE com o id correto", async () => {
      const repo = new PlannedTaskRepository();
      await repo.delete("pt1");
      expect(mockDb.execute).toHaveBeenCalledWith(
        expect.stringContaining("DELETE"),
        ["pt1"]
      );
    });
  });

  describe("findForDate", () => {
    it("retorna tarefas com specific_date na data informada", async () => {
      mockDb.select.mockResolvedValue([makeRow()]);
      const repo = new PlannedTaskRepository();
      const result = await repo.findForDate("2026-04-08");
      expect(result).toHaveLength(1);
    });
  });
});
