import { describe, it, expect, vi } from "vitest";
import { dispatchLocalApiRequest } from "@presentation/localApi/dispatch";
import { startOfDayISO, endOfDayISO } from "@shared/utils/time";
import { localISO } from "../../../helpers/localTime";
import { makeDeps, makeTask, TODAY, WS_ATIVO, WS_OUTRO } from "../fakeDeps";

describe("tasks.start", () => {
  it("resolve projeto e categoria por nome dentro do workspace ativo e troca pela nova tarefa", async () => {
    const nova = makeTask({ id: "t-nova", projectId: "proj-ativo", categoryId: "cat-ativo" });
    const deps = makeDeps({ running: { switchToTask: async () => nova } });

    const result = await dispatchLocalApiRequest(deps, "tasks.start", {
      body: { name: "Daily", projectName: "Cliente", categoryName: "Reuniões", billable: false },
    });

    expect(result.status).toBe(201);
    expect(deps.projectRepo.findByName).toHaveBeenCalledWith("Cliente", WS_ATIVO);
    expect(result.body).toMatchObject({
      id: "t-nova",
      workspaceId: WS_ATIVO,
      projectName: "Cliente",
      categoryName: "Reuniões",
      customValues: {},
      plannedTaskId: null,
    });
  });

  it("repassa o workspace informado à troca de tarefa, sem esperar o envio da anterior", async () => {
    let recebido: unknown;
    let opcoes: unknown;
    const deps = makeDeps({
      running: {
        switchToTask: async (input, options) => {
          recebido = input;
          opcoes = options;
          return makeTask({ workspaceId: WS_OUTRO });
        },
      },
    });

    await dispatchLocalApiRequest(deps, "tasks.start", {
      body: { workspaceId: WS_OUTRO, billable: true },
    });

    expect(recebido).toMatchObject({ workspaceId: WS_OUTRO, billable: true, projectId: null });
    expect(opcoes).toEqual({ syncInBackground: true });
  });

  it("devolve 409 quando o nome do projeto só existe em outro workspace", async () => {
    const deps = makeDeps();
    const result = await dispatchLocalApiRequest(deps, "tasks.start", {
      body: { workspaceId: WS_OUTRO, projectName: "Cliente", billable: true },
    });
    expect(result.status).toBe(409);
    expect(deps.running.switchToTask).not.toHaveBeenCalled();
  });

  it("devolve 409 quando o id do projeto não pertence ao workspace", async () => {
    const deps = makeDeps();
    const result = await dispatchLocalApiRequest(deps, "tasks.start", {
      body: { projectId: "proj-de-outro", billable: true },
    });
    expect(result.status).toBe(409);
  });

  it("devolve 409 para workspace inexistente", async () => {
    const deps = makeDeps();
    const result = await dispatchLocalApiRequest(deps, "tasks.start", {
      body: { workspaceId: "nao-existe", billable: true },
    });
    expect(result).toEqual({
      status: 409,
      body: { error: "Workspace 'nao-existe' não encontrado" },
    });
  });
});

describe("tasks.stop", () => {
  it("para pelo contexto como concluída quando o corpo é omitido", async () => {
    const final = makeTask({ status: "completed", durationSeconds: 3600 });
    const deps = makeDeps({ running: { runningTask: makeTask(), stopTask: async () => final } });
    const calls: boolean[] = [];
    const original = deps.running.stopTask;
    deps.running.stopTask = async (completed) => {
      calls.push(completed);
      return original(completed);
    };

    const result = await dispatchLocalApiRequest(deps, "tasks.stop", { body: null });

    expect(calls).toEqual([true]);
    expect(result.status).toBe(200);
    expect(result.body).toMatchObject({ status: "completed", durationSeconds: 3600 });
  });

  it("respeita completed: false", async () => {
    const calls: boolean[] = [];
    const deps = makeDeps({
      running: {
        runningTask: makeTask(),
        stopTask: async (completed) => {
          calls.push(completed);
          return makeTask({ status: "completed" });
        },
      },
    });
    await dispatchLocalApiRequest(deps, "tasks.stop", { body: { completed: false } });
    expect(calls).toEqual([false]);
  });

  it("pede ao contexto que o envio automático não segure a resposta", async () => {
    let opcoes: unknown;
    const deps = makeDeps({
      running: {
        runningTask: makeTask(),
        stopTask: async (_completed, _end, options) => {
          opcoes = options;
          return makeTask({ status: "completed" });
        },
      },
    });
    await dispatchLocalApiRequest(deps, "tasks.stop", {});
    expect(opcoes).toEqual({ syncInBackground: true });
  });

  it("devolve 204 quando a tarefa é descartada por durar menos de 1 minuto", async () => {
    const deps = makeDeps({ running: { runningTask: makeTask(), stopTask: async () => null } });
    const result = await dispatchLocalApiRequest(deps, "tasks.stop", {});
    expect(result.status).toBe(204);
  });

  it("devolve 404 sem tarefa ativa", async () => {
    const deps = makeDeps();
    const result = await dispatchLocalApiRequest(deps, "tasks.stop", {});
    expect(result).toEqual({ status: 404, body: { error: "Nenhuma tarefa ativa" } });
  });
});

describe("tasks.pause, tasks.resume e tasks.toggle", () => {
  it("pausa pelo contexto e devolve a tarefa relida do repositório", async () => {
    const pausada = makeTask({ status: "paused", durationSeconds: 600 });
    const deps = makeDeps({ running: { runningTask: makeTask() } });
    vi.mocked(deps.running.pauseTask).mockResolvedValue(pausada);

    const result = await dispatchLocalApiRequest(deps, "tasks.pause", {});

    expect(deps.running.pauseTask).toHaveBeenCalled();
    expect(result.status).toBe(200);
    expect(result.body).toMatchObject({ status: "paused", elapsedSeconds: 600 });
  });

  it("não pausa tarefa que já está pausada", async () => {
    const deps = makeDeps({ running: { runningTask: makeTask({ status: "paused" }) } });
    const result = await dispatchLocalApiRequest(deps, "tasks.pause", {});
    expect(result.status).toBe(404);
    expect(deps.running.pauseTask).not.toHaveBeenCalled();
  });

  it("toggle retoma a pausada", async () => {
    const deps = makeDeps({ running: { runningTask: makeTask({ status: "paused" }) } });
    vi.mocked(deps.running.resumeTask).mockResolvedValue(makeTask());
    const result = await dispatchLocalApiRequest(deps, "tasks.toggle", {});
    expect(deps.running.resumeTask).toHaveBeenCalled();
    expect(result.status).toBe(200);
  });

  it("toggle sem tarefa ativa inicia uma nova, billable por padrão", async () => {
    let recebido: unknown;
    const deps = makeDeps({
      running: {
        switchToTask: async (input) => {
          recebido = input;
          return makeTask();
        },
      },
    });
    const result = await dispatchLocalApiRequest(deps, "tasks.toggle", { body: null });
    expect(result.status).toBe(200);
    expect(recebido).toMatchObject({ billable: true, workspaceId: WS_ATIVO });
  });

  it("cancel devolve 204 e cancela pelo contexto", async () => {
    const deps = makeDeps({ running: { runningTask: makeTask() } });
    const result = await dispatchLocalApiRequest(deps, "tasks.cancel", {});
    expect(result.status).toBe(204);
    expect(deps.running.cancelTask).toHaveBeenCalled();
  });
});

describe("status.get", () => {
  it("soma os totais de hoje só do workspace da requisição, contando o tempo corrido da ativa", async () => {
    const ativa = makeTask({ startTime: localISO(2026, 9, 15, 9, 30), durationSeconds: 0 });
    const deps = makeDeps({ running: { runningTask: ativa } });
    deps.taskRepo.findByDateRange.mockResolvedValue([
      makeTask({ id: "a", status: "completed", durationSeconds: 1800, billable: false }),
      ativa,
    ] as never);

    const result = await dispatchLocalApiRequest(deps, "status.get", { workspaceId: WS_OUTRO });

    expect(deps.taskRepo.findByDateRange).toHaveBeenCalledWith(
      startOfDayISO(TODAY),
      endOfDayISO(TODAY),
      WS_OUTRO
    );
    expect(result.body).toMatchObject({
      running: true,
      task: { id: "t-1" },
      today: { totalSeconds: 3600, billableSeconds: 1800, nonBillableSeconds: 1800, taskCount: 2 },
    });
  });

  it("sem tarefa ativa devolve running falso e task nula", async () => {
    const deps = makeDeps();
    const result = await dispatchLocalApiRequest(deps, "status.get", {});
    expect(result.body).toMatchObject({ running: false, task: null });
    expect(deps.taskRepo.findByDateRange).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(String),
      WS_ATIVO
    );
  });
});
