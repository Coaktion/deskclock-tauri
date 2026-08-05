import { describe, it, expect, vi } from "vitest";
import {
  moveTasksToWorkspace,
  type MoveTasksDeps,
} from "@domain/usecases/tasks/MoveTasksToWorkspace";
import type { ITaskRepository } from "@domain/repositories/ITaskRepository";
import type { IProjectRepository } from "@domain/repositories/IProjectRepository";
import type { ICategoryRepository } from "@domain/repositories/ICategoryRepository";
import type { Task } from "@domain/entities/Task";

const NOW = "2026-07-30T12:00:00.000Z";

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: "t1",
    workspaceId: "ws-origem",
    name: "Tarefa",
    projectId: "p-origem",
    categoryId: "c-origem",
    billable: true,
    startTime: "2026-07-30T09:00:00.000Z",
    endTime: "2026-07-30T10:00:00.000Z",
    durationSeconds: 3600,
    status: "completed",
    createdAt: "2026-07-30T09:00:00.000Z",
    updatedAt: "2026-07-30T10:00:00.000Z",
    customValues: {},
    ...overrides,
  };
}

function makeDeps(overrides: Partial<MoveTasksDeps> = {}): MoveTasksDeps {
  const taskRepo: ITaskRepository = {
    save: vi.fn(async () => undefined),
    update: vi.fn(async () => undefined),
    findById: vi.fn(async () => null),
    findByStatus: vi.fn(async () => []),
    findByDateRange: vi.fn(async () => []),
    delete: vi.fn(async () => undefined),
    deleteMany: vi.fn(async () => undefined),
  };
  const projectRepo: IProjectRepository = {
    findAll: vi.fn(async () => []),
    findByName: vi.fn(async () => null),
    save: vi.fn(async () => undefined),
    update: vi.fn(async () => undefined),
    delete: vi.fn(async () => undefined),
    deleteMany: vi.fn(async () => undefined),
  };
  const categoryRepo: ICategoryRepository = {
    findAll: vi.fn(async () => []),
    findByName: vi.fn(async () => null),
    save: vi.fn(async () => undefined),
    update: vi.fn(async () => undefined),
    delete: vi.fn(async () => undefined),
    deleteMany: vi.fn(async () => undefined),
  };
  return { taskRepo, projectRepo, categoryRepo, ...overrides };
}

const UNSET = { kind: "unset" } as const;

describe("moveTasksToWorkspace", () => {
  it("não faz nada com lista vazia", async () => {
    const deps = makeDeps();
    const n = await moveTasksToWorkspace(
      deps,
      [],
      { toWorkspaceId: "ws-destino", project: UNSET, category: UNSET, mode: "move" },
      NOW
    );
    expect(n).toBe(0);
    expect(deps.taskRepo.update).not.toHaveBeenCalled();
    expect(deps.taskRepo.save).not.toHaveBeenCalled();
  });

  it("no modo mover, atualiza a tarefa mantendo o id", async () => {
    const deps = makeDeps();
    await moveTasksToWorkspace(
      deps,
      [makeTask()],
      { toWorkspaceId: "ws-destino", project: UNSET, category: UNSET, mode: "move" },
      NOW
    );

    expect(deps.taskRepo.save).not.toHaveBeenCalled();
    expect(deps.taskRepo.update).toHaveBeenCalledWith(
      expect.objectContaining({ id: "t1", workspaceId: "ws-destino", updatedAt: NOW })
    );
  });

  it("no modo copiar, cria uma tarefa nova sem tocar na original", async () => {
    const deps = makeDeps();
    await moveTasksToWorkspace(
      deps,
      [makeTask()],
      { toWorkspaceId: "ws-destino", project: UNSET, category: UNSET, mode: "copy" },
      NOW
    );

    expect(deps.taskRepo.update).not.toHaveBeenCalled();
    const saved = vi.mocked(deps.taskRepo.save).mock.calls[0][0];
    expect(saved.id).not.toBe("t1");
    expect(saved.workspaceId).toBe("ws-destino");
    expect(saved.createdAt).toBe(NOW);
  });

  it("a origem da execução acompanha a tarefa nos dois modos", async () => {
    // Decisão deliberada: o vínculo registra de onde a execução partiu, e mudar de
    // workspace não desfaz isso. O id de planejada do workspace de origem fica
    // inerte — só tarefa em execução tem o vínculo lido, e aqui se move concluída.
    const deps = makeDeps();
    const plan = { toWorkspaceId: "ws-destino", project: UNSET, category: UNSET } as const;

    await moveTasksToWorkspace(
      deps,
      [makeTask({ plannedTaskId: "pt-1" })],
      { ...plan, mode: "copy" },
      NOW
    );
    expect(vi.mocked(deps.taskRepo.save).mock.calls[0][0].plannedTaskId).toBe("pt-1");

    await moveTasksToWorkspace(
      deps,
      [makeTask({ plannedTaskId: "pt-1" })],
      { ...plan, mode: "move" },
      NOW
    );
    expect(vi.mocked(deps.taskRepo.update).mock.calls[0][0].plannedTaskId).toBe("pt-1");
  });

  it("aplica match reusando o id do destino, sem criar nada", async () => {
    const deps = makeDeps();
    await moveTasksToWorkspace(
      deps,
      [makeTask()],
      {
        toWorkspaceId: "ws-destino",
        project: { kind: "match", targetId: "p-destino" },
        category: { kind: "match", targetId: "c-destino" },
        mode: "move",
      },
      NOW
    );

    expect(deps.projectRepo.save).not.toHaveBeenCalled();
    expect(deps.categoryRepo.save).not.toHaveBeenCalled();
    expect(deps.taskRepo.update).toHaveBeenCalledWith(
      expect.objectContaining({ projectId: "p-destino", categoryId: "c-destino" })
    );
  });

  it("aplica create gerando projeto e categoria no destino", async () => {
    const deps = makeDeps();
    await moveTasksToWorkspace(
      deps,
      [makeTask()],
      {
        toWorkspaceId: "ws-destino",
        project: { kind: "create", name: "Projeto Novo" },
        category: { kind: "create", name: "Categoria Nova" },
        mode: "move",
      },
      NOW
    );

    expect(deps.projectRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({ workspaceId: "ws-destino", name: "Projeto Novo" })
    );
    expect(deps.categoryRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({ workspaceId: "ws-destino", name: "Categoria Nova" })
    );
  });

  it("aplica unset deixando projeto e categoria vazios", async () => {
    const deps = makeDeps();
    await moveTasksToWorkspace(
      deps,
      [makeTask()],
      { toWorkspaceId: "ws-destino", project: UNSET, category: UNSET, mode: "move" },
      NOW
    );

    expect(deps.taskRepo.update).toHaveBeenCalledWith(
      expect.objectContaining({ projectId: null, categoryId: null })
    );
  });

  it("cai no homônimo existente quando a criação colide com a unicidade", async () => {
    const deps = makeDeps({
      projectRepo: {
        findAll: vi.fn(async () => []),
        findByName: vi.fn(async () => ({
          id: "p-ja-existia",
          workspaceId: "ws-destino",
          name: "Projeto Novo",
        })),
        save: vi.fn(async () => {
          throw new Error("UNIQUE constraint failed");
        }),
        update: vi.fn(async () => undefined),
        delete: vi.fn(async () => undefined),
        deleteMany: vi.fn(async () => undefined),
      },
    });

    await moveTasksToWorkspace(
      deps,
      [makeTask()],
      {
        toWorkspaceId: "ws-destino",
        project: { kind: "create", name: "Projeto Novo" },
        category: UNSET,
        mode: "move",
      },
      NOW
    );

    expect(deps.taskRepo.update).toHaveBeenCalledWith(
      expect.objectContaining({ projectId: "p-ja-existia" })
    );
  });

  it("resolve o catálogo uma vez só para o lote inteiro", async () => {
    const deps = makeDeps();
    const tasks = [makeTask({ id: "t1" }), makeTask({ id: "t2" }), makeTask({ id: "t3" })];

    const n = await moveTasksToWorkspace(
      deps,
      tasks,
      {
        toWorkspaceId: "ws-destino",
        project: { kind: "create", name: "Projeto Novo" },
        category: UNSET,
        mode: "move",
      },
      NOW
    );

    expect(n).toBe(3);
    expect(deps.projectRepo.save).toHaveBeenCalledTimes(1);
    expect(deps.taskRepo.update).toHaveBeenCalledTimes(3);
  });
});
