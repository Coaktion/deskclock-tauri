import { describe, it, expect } from "vitest";
import { groupTasks } from "@shared/utils/groupTasks";
import type { Task } from "@domain/entities/Task";

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: "t1",
    name: "Task A",
    projectId: "p1",
    categoryId: "c1",
    billable: true,
    startTime: "2026-04-08T09:00:00.000Z",
    endTime: "2026-04-08T10:00:00.000Z",
    durationSeconds: 3600,
    status: "completed",
    createdAt: "2026-04-08T09:00:00.000Z",
    updatedAt: "2026-04-08T10:00:00.000Z",
    ...overrides,
  };
}

describe("groupTasks", () => {
  it("agrupa tarefas com mesmo nome+projeto+categoria", () => {
    const tasks = [
      makeTask({ id: "t1", durationSeconds: 3600 }),
      makeTask({ id: "t2", durationSeconds: 1800 }),
    ];
    const groups = groupTasks(tasks);
    expect(groups).toHaveLength(1);
    expect(groups[0].tasks).toHaveLength(2);
    expect(groups[0].totalSeconds).toBe(5400);
  });

  it("separa tarefas com nomes diferentes", () => {
    const tasks = [makeTask({ id: "t1", name: "Task A" }), makeTask({ id: "t2", name: "Task B" })];
    const groups = groupTasks(tasks);
    expect(groups).toHaveLength(2);
  });

  it("separa tarefas com projetos diferentes", () => {
    const tasks = [
      makeTask({ id: "t1", projectId: "p1" }),
      makeTask({ id: "t2", projectId: "p2" }),
    ];
    const groups = groupTasks(tasks);
    expect(groups).toHaveLength(2);
  });

  it("separa tarefas com categorias diferentes", () => {
    const tasks = [
      makeTask({ id: "t1", categoryId: "c1" }),
      makeTask({ id: "t2", categoryId: "c2" }),
    ];
    const groups = groupTasks(tasks);
    expect(groups).toHaveLength(2);
  });

  it("trata null como valor de agrupamento válido", () => {
    const tasks = [
      makeTask({ id: "t1", name: null, projectId: null, categoryId: null }),
      makeTask({ id: "t2", name: null, projectId: null, categoryId: null }),
    ];
    const groups = groupTasks(tasks);
    expect(groups).toHaveLength(1);
    expect(groups[0].tasks).toHaveLength(2);
  });

  it("retorna array vazio para input vazio", () => {
    expect(groupTasks([])).toHaveLength(0);
  });

  it("soma durationSeconds nulo como 0", () => {
    const tasks = [
      makeTask({ id: "t1", durationSeconds: null }),
      makeTask({ id: "t2", durationSeconds: 1800 }),
    ];
    const groups = groupTasks(tasks);
    expect(groups[0].totalSeconds).toBe(1800);
  });
});
