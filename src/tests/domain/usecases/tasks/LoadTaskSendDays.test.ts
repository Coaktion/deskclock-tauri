import { describe, it, expect, vi } from "vitest";
import type { Task } from "@domain/entities/Task";
import { validateTaskForClockify } from "@domain/integrations/taskValidation";
import { groupSendStatus, loadTaskSendDays } from "@domain/usecases/tasks/LoadTaskSendDays";
import { localISO } from "../../../helpers/localTime";

function makeTask(overrides: Partial<Task>): Task {
  return {
    id: "t",
    workspaceId: "ws-1",
    name: "Tarefa",
    projectId: "p1",
    categoryId: null,
    billable: true,
    startTime: localISO(2026, 9, 15, 9),
    endTime: localISO(2026, 9, 15, 10),
    durationSeconds: 3600,
    status: "completed",
    createdAt: localISO(2026, 9, 15, 9),
    updatedAt: localISO(2026, 9, 15, 10),
    customValues: {},
    ...overrides,
  };
}

describe("loadTaskSendDays", () => {
  it("busca no workspace da integração, só concluídas, por dia do mais recente", async () => {
    const taskRepo = {
      findByDateRange: vi.fn(async () => [
        makeTask({ id: "a", startTime: localISO(2026, 9, 14, 9) }),
        makeTask({ id: "b" }),
        makeTask({ id: "c", status: "running" }),
      ]),
    };
    const logRepo = { markSent: vi.fn(), findSentIds: vi.fn(async () => ["b"]) };

    const { dayGroups, sentIds } = await loadTaskSendDays(
      taskRepo as never,
      logRepo,
      "clockify",
      "ws-1",
      "S",
      "E"
    );

    expect(taskRepo.findByDateRange).toHaveBeenCalledWith("S", "E", "ws-1");
    expect(logRepo.findSentIds).toHaveBeenCalledWith("clockify", "S", "E");
    expect(
      dayGroups.map((d) => [d.date, d.groups.flatMap((g) => g.tasks.map((t) => t.id))])
    ).toEqual([
      ["2026-09-15", ["b"]],
      ["2026-09-14", ["a"]],
    ]);
    expect([...sentIds]).toEqual(["b"]);
  });
});

describe("groupSendStatus", () => {
  const group = (tasks: Task[]) => ({ key: "k", tasks, totalSeconds: 0 });

  it("inválido quando a primeira tarefa não passa na validação", () => {
    expect(
      groupSendStatus(group([makeTask({ projectId: null })]), new Set(), validateTaskForClockify)
    ).toEqual({
      state: "invalid",
      missing: ["projeto"],
      partiallySent: false,
    });
  });

  it("enviado só com todas as tarefas no log", () => {
    const g = group([makeTask({ id: "a" }), makeTask({ id: "b" })]);
    expect(groupSendStatus(g, new Set(["a", "b"]), validateTaskForClockify).state).toBe("sent");
    expect(groupSendStatus(g, new Set(["a"]), validateTaskForClockify)).toEqual({
      state: "pending",
      missing: [],
      partiallySent: true,
    });
  });
});
