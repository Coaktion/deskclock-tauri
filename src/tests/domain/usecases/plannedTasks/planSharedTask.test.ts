import { describe, it, expect, vi } from "vitest";
import { planSharedTask, type SharedTaskPlan } from "@domain/usecases/plannedTasks/planSharedTask";
import type { IPlannedTaskRepository } from "@domain/repositories/IPlannedTaskRepository";

function makeRepo(): IPlannedTaskRepository {
  return {
    save: vi.fn(async () => undefined),
    update: vi.fn(async () => undefined),
    findById: vi.fn(async () => null),
    findForDate: vi.fn(async () => []),
    findAll: vi.fn(async () => []),
    findForWeek: vi.fn(async () => []),
    complete: vi.fn(async () => undefined),
    uncomplete: vi.fn(async () => undefined),
    reorder: vi.fn(async () => undefined),
    delete: vi.fn(async () => undefined),
  } as unknown as IPlannedTaskRepository;
}

const PLAN: SharedTaskPlan = {
  workspaceId: "ws-1",
  name: "Revisão",
  projectId: "p-1",
  categoryId: null,
  billable: true,
  customValues: { f: "x" },
  date: "2026-10-23",
  startTime: "",
  endTime: "",
};

describe("planSharedTask", () => {
  it("grava sempre specific_date na data escolhida, sem horário quando vem vazio", async () => {
    const task = await planSharedTask(makeRepo(), PLAN, "2026-10-23T12:00:00.000Z");
    expect(task).toMatchObject({
      scheduleType: "specific_date",
      scheduleDate: "2026-10-23",
      recurringDays: null,
      name: "Revisão",
      customValues: { f: "x" },
    });
    expect(task.startTime).toBeUndefined();
    expect(task.endTime).toBeUndefined();
  });

  it("leva o horário quando o link o trouxe", async () => {
    const task = await planSharedTask(
      makeRepo(),
      { ...PLAN, startTime: "09:00", endTime: "09:30" },
      "2026-10-23T12:00:00.000Z"
    );
    expect(task).toMatchObject({ startTime: "09:00", endTime: "09:30" });
  });
});
