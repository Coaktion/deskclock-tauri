import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Task } from "@domain/entities/Task";

const mockDb = {
  select: vi.fn(),
  execute: vi.fn(),
};

vi.mock("@infra/database/db", () => ({
  getDb: vi.fn(async () => mockDb),
}));

const { TaskRepository } = await import("@infra/database/TaskRepository");

function makeRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: "t1",
    name: null,
    project_id: null,
    category_id: null,
    billable: 1,
    start_time: "2026-04-08T09:00:00.000Z",
    end_time: null,
    duration_seconds: 3600,
    status: "completed",
    created_at: "2026-04-08T09:00:00.000Z",
    updated_at: "2026-04-08T10:00:00.000Z",
    ...overrides,
  };
}

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: "t1",
    name: null,
    projectId: null,
    categoryId: null,
    billable: true,
    startTime: "2026-04-08T09:00:00.000Z",
    endTime: null,
    durationSeconds: 3600,
    status: "completed",
    createdAt: "2026-04-08T09:00:00.000Z",
    updatedAt: "2026-04-08T10:00:00.000Z",
    ...overrides,
  };
}

describe("TaskRepository", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDb.select.mockResolvedValue([]);
    mockDb.execute.mockResolvedValue({ rowsAffected: 1, lastInsertId: 0 });
  });

  describe("findById", () => {
    it("retorna task mapeada quando encontrada", async () => {
      mockDb.select.mockResolvedValue([makeRow()]);
      const repo = new TaskRepository();
      const result = await repo.findById("t1");
      expect(result).not.toBeNull();
      expect(result?.id).toBe("t1");
      expect(result?.billable).toBe(true);
    });

    it("converte billable=0 para false", async () => {
      mockDb.select.mockResolvedValue([makeRow({ billable: 0 })]);
      const repo = new TaskRepository();
      const result = await repo.findById("t1");
      expect(result?.billable).toBe(false);
    });

    it("retorna null quando não encontrada", async () => {
      mockDb.select.mockResolvedValue([]);
      const repo = new TaskRepository();
      const result = await repo.findById("inexistente");
      expect(result).toBeNull();
    });

    it("mapeia snake_case para camelCase", async () => {
      mockDb.select.mockResolvedValue([
        makeRow({
          project_id: "p1",
          category_id: "c1",
          start_time: "2026-04-08T09:00:00.000Z",
          end_time: "2026-04-08T10:00:00.000Z",
          duration_seconds: 3600,
          created_at: "2026-04-08T09:00:00.000Z",
          updated_at: "2026-04-08T10:00:00.000Z",
        }),
      ]);
      const repo = new TaskRepository();
      const result = await repo.findById("t1");
      expect(result?.projectId).toBe("p1");
      expect(result?.categoryId).toBe("c1");
      expect(result?.startTime).toBe("2026-04-08T09:00:00.000Z");
      expect(result?.endTime).toBe("2026-04-08T10:00:00.000Z");
      expect(result?.durationSeconds).toBe(3600);
    });
  });

  describe("findByStatus", () => {
    it("seleciona tasks pelo status", async () => {
      mockDb.select.mockResolvedValue([makeRow({ status: "running" })]);
      const repo = new TaskRepository();
      const result = await repo.findByStatus("running");
      expect(mockDb.select).toHaveBeenCalledWith(expect.stringContaining("status"), ["running"]);
      expect(result).toHaveLength(1);
    });
  });

  describe("findByDateRange", () => {
    it("seleciona tasks por range de start_time", async () => {
      mockDb.select.mockResolvedValue([makeRow()]);
      const repo = new TaskRepository();
      const start = "2026-04-08T00:00:00.000Z";
      const end = "2026-04-08T23:59:59.999Z";
      const result = await repo.findByDateRange(start, end);
      expect(mockDb.select).toHaveBeenCalledWith(expect.any(String), [start, end]);
      expect(result).toHaveLength(1);
    });
  });

  describe("save", () => {
    it("executa INSERT com os dados corretos", async () => {
      const repo = new TaskRepository();
      const task = makeTask();
      await repo.save(task);
      expect(mockDb.execute).toHaveBeenCalledWith(
        expect.stringContaining("INSERT"),
        expect.arrayContaining(["t1"])
      );
    });

    it("converte billable=true para 1", async () => {
      const repo = new TaskRepository();
      await repo.save(makeTask({ billable: true }));
      const args = mockDb.execute.mock.calls[0][1] as unknown[];
      expect(args).toContain(1);
    });

    it("converte billable=false para 0", async () => {
      const repo = new TaskRepository();
      await repo.save(makeTask({ billable: false }));
      const args = mockDb.execute.mock.calls[0][1] as unknown[];
      expect(args).toContain(0);
    });
  });

  describe("update", () => {
    it("executa UPDATE com os dados corretos", async () => {
      const repo = new TaskRepository();
      await repo.update(makeTask());
      expect(mockDb.execute).toHaveBeenCalledWith(
        expect.stringContaining("UPDATE"),
        expect.arrayContaining(["t1"])
      );
    });
  });

  describe("delete", () => {
    it("executa DELETE com o id correto", async () => {
      const repo = new TaskRepository();
      await repo.delete("t1");
      expect(mockDb.execute).toHaveBeenCalledWith(expect.stringContaining("DELETE"), ["t1"]);
    });
  });

  describe("deleteMany", () => {
    it("executa DELETE com múltiplos ids", async () => {
      const repo = new TaskRepository();
      await repo.deleteMany(["t1", "t2", "t3"]);
      expect(mockDb.execute).toHaveBeenCalledWith(
        expect.stringContaining("DELETE"),
        expect.arrayContaining(["t1", "t2", "t3"])
      );
    });

    it("não executa nada quando lista vazia", async () => {
      const repo = new TaskRepository();
      await repo.deleteMany([]);
      expect(mockDb.execute).not.toHaveBeenCalled();
    });
  });
});
