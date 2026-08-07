import type { PlannedTask } from "@domain/entities/PlannedTask";
import type { IPlannedTaskRepository } from "@domain/repositories/IPlannedTaskRepository";
import type { ITaskRepository } from "@domain/repositories/ITaskRepository";
import { launchPlannedTaskRetroactively } from "@domain/usecases/tasks/LaunchPlannedTaskRetroactively";
import { localISO } from "../../../helpers/localTime";
import { describe, expect, it, vi } from "vitest";

function makeTaskRepo(overrides: Partial<ITaskRepository> = {}): ITaskRepository {
  return {
    save: vi.fn(async () => undefined),
    update: vi.fn(async () => undefined),
    findById: vi.fn(async () => null),
    findByStatus: vi.fn(async () => []),
    findByDateRange: vi.fn(async () => []),
    delete: vi.fn(async () => undefined),
    deleteMany: vi.fn(async () => undefined),
    ...overrides,
  };
}

function makePlannedRepo(overrides: Partial<IPlannedTaskRepository> = {}): IPlannedTaskRepository {
  return {
    save: vi.fn(async () => undefined),
    update: vi.fn(async () => undefined),
    findById: vi.fn(async () => null),
    findForDate: vi.fn(async () => []),
    findForWeek: vi.fn(async () => []),
    complete: vi.fn(async () => undefined),
    uncomplete: vi.fn(async () => undefined),
    reorder: vi.fn(async () => undefined),
    delete: vi.fn(async () => undefined),
    ...overrides,
  };
}

function makePlanned(overrides: Partial<PlannedTask> = {}): PlannedTask {
  return {
    id: "pt-1",
    workspaceId: "ws-1",
    name: "Daily",
    projectId: "proj-1",
    categoryId: "cat-1",
    billable: false,
    scheduleType: "specific_date",
    scheduleDate: "2026-04-08",
    recurringDays: null,
    periodStart: null,
    periodEnd: null,
    completedDates: [],
    actions: [],
    sortOrder: 0,
    createdAt: localISO(2026, 4, 1),
    customValues: {},
    startTime: "09:00",
    endTime: "10:30",
    ...overrides,
  };
}

const DATE = "2026-04-08";
const NOW = localISO(2026, 4, 8, 18);

describe("launchPlannedTaskRetroactively", () => {
  it("monta o intervalo a partir do horário local da planejada", async () => {
    const task = await launchPlannedTaskRetroactively(
      makeTaskRepo(),
      makePlannedRepo(),
      makePlanned(),
      DATE,
      NOW
    );

    expect(task.startTime).toBe(localISO(2026, 4, 8, 9, 0));
    expect(task.endTime).toBe(localISO(2026, 4, 8, 10, 30));
    expect(task.durationSeconds).toBe(5400);
    expect(task.status).toBe("completed");
  });

  it("atribui o fim ao dia seguinte quando o evento cruza a meia-noite", async () => {
    const task = await launchPlannedTaskRetroactively(
      makeTaskRepo(),
      makePlannedRepo(),
      makePlanned({ startTime: "23:00", endTime: "00:30" }),
      DATE,
      NOW
    );

    expect(task.endTime).toBe(localISO(2026, 4, 9, 0, 30));
    expect(task.durationSeconds).toBe(5400);
  });

  it("nasce no workspace da planejada, não no que foi passado por fora", async () => {
    const task = await launchPlannedTaskRetroactively(
      makeTaskRepo(),
      makePlannedRepo(),
      makePlanned({ workspaceId: "ws-outro" }),
      DATE,
      NOW
    );

    expect(task.workspaceId).toBe("ws-outro");
  });

  it("leva os campos personalizados copiados, sem partilhar o objeto", async () => {
    const planned = makePlanned({ customValues: { "field-stage": "opt-1" } });
    const task = await launchPlannedTaskRetroactively(
      makeTaskRepo(),
      makePlannedRepo(),
      planned,
      DATE,
      NOW
    );

    expect(task.customValues).toEqual({ "field-stage": "opt-1" });
    expect(task.customValues).not.toBe(planned.customValues);
  });

  it("marca a planejada como concluída na data lançada", async () => {
    const plannedRepo = makePlannedRepo();
    await launchPlannedTaskRetroactively(makeTaskRepo(), plannedRepo, makePlanned(), DATE, NOW);

    expect(plannedRepo.complete).toHaveBeenCalledWith("pt-1", DATE);
  });

  it("persiste a tarefa antes de concluir a planejada", async () => {
    const order: string[] = [];
    const taskRepo = makeTaskRepo({
      save: vi.fn(async () => {
        order.push("save");
      }),
    });
    const plannedRepo = makePlannedRepo({
      complete: vi.fn(async () => {
        order.push("complete");
      }),
    });

    await launchPlannedTaskRetroactively(taskRepo, plannedRepo, makePlanned(), DATE, NOW);

    expect(order).toEqual(["save", "complete"]);
  });

  it("recusa planejada sem horário e não conclui nada", async () => {
    const plannedRepo = makePlannedRepo();
    await expect(
      launchPlannedTaskRetroactively(
        makeTaskRepo(),
        plannedRepo,
        makePlanned({ startTime: undefined, endTime: undefined }),
        DATE,
        NOW
      )
    ).rejects.toThrow(/sem horário/);
    expect(plannedRepo.complete).not.toHaveBeenCalled();
  });

  it("nome vazio vira null, como no lançamento manual", async () => {
    const task = await launchPlannedTaskRetroactively(
      makeTaskRepo(),
      makePlannedRepo(),
      makePlanned({ name: "" }),
      DATE,
      NOW
    );

    expect(task.name).toBeNull();
  });
});
