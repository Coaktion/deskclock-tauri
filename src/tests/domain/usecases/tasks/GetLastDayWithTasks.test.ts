import { describe, it, expect, vi } from "vitest";
import { getLastDayWithTasks } from "@domain/usecases/tasks/GetLastDayWithTasks";
import { startOfDayISO, endOfDayISO } from "@shared/utils/time";
import type { ITaskRepository } from "@domain/repositories/ITaskRepository";
import type { Task } from "@domain/entities/Task";
import { localISO } from "../../../helpers/localTime";

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: "t1",
    workspaceId: "ws-1",
    name: "Revisar PR",
    projectId: null,
    categoryId: null,
    billable: true,
    startTime: localISO(2026, 8, 21, 9),
    endTime: localISO(2026, 8, 21, 10),
    durationSeconds: 3600,
    status: "completed",
    createdAt: localISO(2026, 8, 21, 9),
    updatedAt: localISO(2026, 8, 21, 10),
    customValues: {},
    ...overrides,
  };
}

function makeRepo(lastDay: string | null, dayTasks: Task[] = []): ITaskRepository {
  return {
    save: vi.fn(),
    update: vi.fn(),
    findById: vi.fn(async () => null),
    findByStatus: vi.fn(async () => []),
    findByDateRange: vi.fn(async () => dayTasks),
    findLastDayWithCompletedTasks: vi.fn(async () => lastDay),
    delete: vi.fn(),
    deleteMany: vi.fn(),
  };
}

describe("getLastDayWithTasks", () => {
  it("devolve o dia de hoje e suas tarefas quando hoje já tem registro", async () => {
    const hoje = makeTask({ id: "t1", startTime: localISO(2026, 8, 27, 14) });
    const repo = makeRepo("2026-08-27", [hoje]);

    const result = await getLastDayWithTasks(repo);

    expect(result?.dateISO).toBe("2026-08-27");
    expect(result?.tasks.map((t) => t.id)).toEqual(["t1"]);
  });

  it("volta ao último dia trabalhado quando hoje e ontem estão vazios", async () => {
    // O caso que justifica o recurso: na segunda-feira o último dia com trabalho
    // é a sexta, não "ontem".
    const sexta = makeTask({ id: "t9", startTime: localISO(2026, 8, 21, 9) });
    const repo = makeRepo("2026-08-21", [sexta]);

    const result = await getLastDayWithTasks(repo);

    expect(result?.dateISO).toBe("2026-08-21");
    expect(result?.tasks.map((t) => t.id)).toEqual(["t9"]);
  });

  it("busca as tarefas nos limites locais do dia encontrado", async () => {
    const repo = makeRepo("2026-08-21");

    await getLastDayWithTasks(repo);

    expect(repo.findByDateRange).toHaveBeenCalledWith(
      startOfDayISO("2026-08-21"),
      endOfDayISO("2026-08-21"),
      undefined
    );
  });

  it("devolve null quando não há nenhuma tarefa concluída", async () => {
    const repo = makeRepo(null);

    const result = await getLastDayWithTasks(repo);

    expect(result).toBeNull();
    expect(repo.findByDateRange).not.toHaveBeenCalled();
  });

  it("descarta as tarefas em andamento e pausadas do dia", async () => {
    const repo = makeRepo("2026-08-21", [
      makeTask({ id: "concluida", status: "completed" }),
      makeTask({ id: "rodando", status: "running" }),
      makeTask({ id: "pausada", status: "paused" }),
    ]);

    const result = await getLastDayWithTasks(repo);

    expect(result?.tasks.map((t) => t.id)).toEqual(["concluida"]);
  });

  it("aplica o mesmo workspace ao dia e às tarefas", async () => {
    const repo = makeRepo("2026-08-21");

    await getLastDayWithTasks(repo, "ws-2");

    expect(repo.findLastDayWithCompletedTasks).toHaveBeenCalledWith("ws-2");
    expect(repo.findByDateRange).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(String),
      "ws-2"
    );
  });
});
