import { describe, it, expect, vi } from "vitest";
import { getTasksForDate } from "@domain/usecases/tasks/GetTasksForDate";
import { startOfDayISO, endOfDayISO } from "@shared/utils/time";
import type { ITaskRepository } from "@domain/repositories/ITaskRepository";

describe("getTasksForDate", () => {
  it("chama findByDateRange com range do horário local para a data", async () => {
    const repo: ITaskRepository = {
      save: vi.fn(),
      update: vi.fn(),
      findById: vi.fn(async () => null),
      findByStatus: vi.fn(async () => []),
      findByDateRange: vi.fn(async () => []),
      delete: vi.fn(),
      deleteMany: vi.fn(),
    };
    await getTasksForDate(repo, "2026-04-08");
    expect(repo.findByDateRange).toHaveBeenCalledWith(
      startOfDayISO("2026-04-08"),
      endOfDayISO("2026-04-08")
    );
  });

  it("retorna as tasks do repositório", async () => {
    const tasks = [
      {
        id: "t1",
        name: null,
        projectId: null,
        categoryId: null,
        billable: true,
        startTime: "2026-04-08T09:00:00.000Z",
        endTime: "2026-04-08T10:00:00.000Z",
        durationSeconds: 3600,
        status: "completed" as const,
        createdAt: "2026-04-08T09:00:00.000Z",
        updatedAt: "2026-04-08T10:00:00.000Z",
      },
    ];
    const repo: ITaskRepository = {
      save: vi.fn(),
      update: vi.fn(),
      findById: vi.fn(async () => null),
      findByStatus: vi.fn(async () => []),
      findByDateRange: vi.fn(async () => tasks),
      delete: vi.fn(),
      deleteMany: vi.fn(),
    };
    const result = await getTasksForDate(repo, "2026-04-08");
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("t1");
  });
});
