import { describe, it, expect } from "vitest";
import { groupTasks, taskGroupKey } from "@domain/utils/groupTasks";
import type { Task } from "@domain/entities/Task";

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: "t1",
    workspaceId: "ws-1",
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
    customValues: {},
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
    const tasks = [
      makeTask({ id: "t1", workspaceId: "ws-1", name: "Task A" }),
      makeTask({ id: "t2", workspaceId: "ws-1", name: "Task B" }),
    ];
    const groups = groupTasks(tasks);
    expect(groups).toHaveLength(2);
  });

  it("separa tarefas com projetos diferentes", () => {
    const tasks = [
      makeTask({ id: "t1", workspaceId: "ws-1", projectId: "p1" }),
      makeTask({ id: "t2", workspaceId: "ws-1", projectId: "p2" }),
    ];
    const groups = groupTasks(tasks);
    expect(groups).toHaveLength(2);
  });

  it("separa tarefas com categorias diferentes", () => {
    const tasks = [
      makeTask({ id: "t1", workspaceId: "ws-1", categoryId: "c1" }),
      makeTask({ id: "t2", workspaceId: "ws-1", categoryId: "c2" }),
    ];
    const groups = groupTasks(tasks);
    expect(groups).toHaveLength(2);
  });

  it("trata null como valor de agrupamento válido", () => {
    const tasks = [
      makeTask({ id: "t1", workspaceId: "ws-1", name: null, projectId: null, categoryId: null }),
      makeTask({ id: "t2", workspaceId: "ws-1", name: null, projectId: null, categoryId: null }),
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

  it("separa tarefas com valores personalizados diferentes", () => {
    const tasks = [
      makeTask({ id: "t1", customValues: { "f-stage": "o1" } }),
      makeTask({ id: "t2", customValues: { "f-stage": "o2" } }),
    ];
    expect(groupTasks(tasks)).toHaveLength(2);
  });

  it("agrupa quando os valores personalizados são iguais", () => {
    const tasks = [
      makeTask({ id: "t1", customValues: { "f-stage": "o1" } }),
      makeTask({ id: "t2", customValues: { "f-stage": "o1" } }),
    ];
    expect(groupTasks(tasks)).toHaveLength(1);
  });
});

describe("taskGroupKey com valores personalizados", () => {
  it("independe da ordem de inserção das chaves", () => {
    const a = makeTask({ customValues: { f1: "x", f2: "y" } });
    const b = makeTask({ customValues: { f2: "y", f1: "x" } });
    expect(taskGroupKey(a)).toBe(taskGroupKey(b));
  });

  it("trata valor vazio como ausência de valor", () => {
    // Uma tarefa criada antes de o campo existir precisa continuar agrupando
    // com uma nova que deixou o campo em branco.
    const antiga = makeTask({ customValues: {} });
    const nova = makeTask({ customValues: { f1: "" } });
    expect(taskGroupKey(antiga)).toBe(taskGroupKey(nova));
  });

  it("não confunde campos distintos com o mesmo valor", () => {
    const a = makeTask({ customValues: { f1: "x" } });
    const b = makeTask({ customValues: { f2: "x" } });
    expect(taskGroupKey(a)).not.toBe(taskGroupKey(b));
  });

  it("mantém a chave dos campos de sistema quando não há valor personalizado", () => {
    expect(taskGroupKey(makeTask({ name: "A", projectId: "p1", categoryId: "c1" }))).toBe(
      "A|p1|c1|"
    );
  });
});
