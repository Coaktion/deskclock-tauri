import { describe, it, expect, vi } from "vitest";
import { getWeekTotal } from "@domain/usecases/tasks/GetWeekTotal";
import type { ITaskRepository } from "@domain/repositories/ITaskRepository";
import type { Task } from "@domain/entities/Task";
import { endOfDayISO, startOfDayISO } from "@shared/utils/time";

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: "t1",
    workspaceId: "ws-1",
    name: null,
    projectId: null,
    categoryId: null,
    billable: true,
    startTime: "2026-04-08T09:00:00.000Z",
    endTime: "2026-04-08T10:00:00.000Z",
    durationSeconds: 3600,
    status: "completed",
    createdAt: "2026-04-08T09:00:00.000Z",
    updatedAt: "2026-04-08T10:00:00.000Z",
    customValues: {},
    ...overrides,
  };
}

describe("getWeekTotal", () => {
  it("soma durações de todas as tarefas da semana", async () => {
    const tasks = [
      makeTask({ id: "t1", durationSeconds: 3600 }),
      makeTask({ id: "t2", durationSeconds: 7200 }),
    ];
    const repo: ITaskRepository = {
      save: vi.fn(),
      update: vi.fn(),
      findById: vi.fn(async () => null),
      findByStatus: vi.fn(async () => []),
      findByDateRange: vi.fn(async () => tasks),
      findLastDayWithCompletedTasks: vi.fn(async () => null),
      delete: vi.fn(),
      deleteMany: vi.fn(),
    };
    const result = await getWeekTotal(repo, "2026-04-07", "2026-04-13");
    expect(result.totalSeconds).toBe(10800);
  });

  it("retorna zero quando sem tarefas", async () => {
    const repo: ITaskRepository = {
      save: vi.fn(),
      update: vi.fn(),
      findById: vi.fn(async () => null),
      findByStatus: vi.fn(async () => []),
      findByDateRange: vi.fn(async () => []),
      findLastDayWithCompletedTasks: vi.fn(async () => null),
      delete: vi.fn(),
      deleteMany: vi.fn(),
    };
    const result = await getWeekTotal(repo, "2026-04-07", "2026-04-13");
    expect(result.totalSeconds).toBe(0);
  });

  it("repassa o workspace ao repositório", async () => {
    // Sem o terceiro argumento o repositório soma TODOS os workspaces (§6.7) —
    // era o que fazia o total da semana divergir dos totais do dia ao lado.
    const findByDateRange = vi.fn(async () => []);
    const repo: ITaskRepository = {
      save: vi.fn(),
      update: vi.fn(),
      findById: vi.fn(async () => null),
      findByStatus: vi.fn(async () => []),
      findByDateRange,
      findLastDayWithCompletedTasks: vi.fn(async () => null),
      delete: vi.fn(),
      deleteMany: vi.fn(),
    };
    await getWeekTotal(repo, "2026-04-07", "2026-04-13", "ws-2");
    expect(findByDateRange).toHaveBeenCalledWith(expect.any(String), expect.any(String), "ws-2");
  });

  it("usa os limites do dia no fuso local, não a meia-noite UTC", async () => {
    // `${data}T00:00:00.000Z` abria a semana às 21h do domingo anterior em
    // UTC−3, somando horas de fora da semana (§6.6).
    const findByDateRange = vi.fn(async () => []);
    const repo: ITaskRepository = {
      save: vi.fn(),
      update: vi.fn(),
      findById: vi.fn(async () => null),
      findByStatus: vi.fn(async () => []),
      findByDateRange,
      findLastDayWithCompletedTasks: vi.fn(async () => null),
      delete: vi.fn(),
      deleteMany: vi.fn(),
    };
    await getWeekTotal(repo, "2026-04-07", "2026-04-13");
    expect(findByDateRange).toHaveBeenCalledWith(
      startOfDayISO("2026-04-07"),
      endOfDayISO("2026-04-13"),
      undefined
    );
  });

  it("conta como um só dia tarefas do mesmo dia local em dias UTC diferentes", async () => {
    // Só falha fora do UTC — que é onde o usuário está. Com `.slice(0, 10)` no
    // ISO, a tarefa das 23h30 caía no dia seguinte e dobrava `daysWorked`.
    const tasks = [
      makeTask({ id: "t1", startTime: new Date(2026, 3, 7, 0, 30).toISOString() }),
      makeTask({ id: "t2", startTime: new Date(2026, 3, 7, 23, 30).toISOString() }),
    ];
    const repo: ITaskRepository = {
      save: vi.fn(),
      update: vi.fn(),
      findById: vi.fn(async () => null),
      findByStatus: vi.fn(async () => []),
      findByDateRange: vi.fn(async () => tasks),
      findLastDayWithCompletedTasks: vi.fn(async () => null),
      delete: vi.fn(),
      deleteMany: vi.fn(),
    };
    const result = await getWeekTotal(repo, "2026-04-07", "2026-04-13");
    expect(result.daysWorked).toBe(1);
  });

  it("conta apenas dias com tarefas", async () => {
    const tasks = [
      makeTask({ id: "t1", startTime: "2026-04-07T09:00:00.000Z", durationSeconds: 1800 }),
      makeTask({ id: "t2", startTime: "2026-04-09T10:00:00.000Z", durationSeconds: 900 }),
    ];
    const repo: ITaskRepository = {
      save: vi.fn(),
      update: vi.fn(),
      findById: vi.fn(async () => null),
      findByStatus: vi.fn(async () => []),
      findByDateRange: vi.fn(async () => tasks),
      findLastDayWithCompletedTasks: vi.fn(async () => null),
      delete: vi.fn(),
      deleteMany: vi.fn(),
    };
    const result = await getWeekTotal(repo, "2026-04-07", "2026-04-13");
    expect(result.totalSeconds).toBe(2700);
    expect(result.daysWorked).toBe(2);
  });
});
