import { describe, it, expect } from "vitest";
import { dispatchLocalApiRequest, changesRunningTask } from "@presentation/localApi/dispatch";
import { toErrorResult, NotFoundError, ConflictError } from "@presentation/localApi/errors";
import { DomainError, DuplicateNameError } from "@shared/errors";
import { makeDeps, makeTask } from "./fakeDeps";

describe("dispatchLocalApiRequest", () => {
  it("devolve 404 para operação desconhecida", async () => {
    const result = await dispatchLocalApiRequest(makeDeps(), "tasks.fly", {});
    expect(result.status).toBe(404);
  });

  it("transforma erro inesperado em 500 em vez de rejeitar", async () => {
    const deps = makeDeps();
    deps.projectRepo.findAll.mockRejectedValue(new Error("disco cheio"));
    const result = await dispatchLocalApiRequest(deps, "projects.list", {});
    expect(result).toEqual({ status: 500, body: { error: "Erro interno: disco cheio" } });
  });

  it("transforma DomainError do caso de uso em 400", async () => {
    const deps = makeDeps({
      running: {
        runningTask: makeTask(),
        stopTask: async () => {
          throw new DomainError("Task t-1 is already completed");
        },
      },
    });
    const result = await dispatchLocalApiRequest(deps, "tasks.stop", {});
    expect(result.status).toBe(400);
  });
});

describe("toErrorResult", () => {
  it("mapeia cada tipo de erro para o status da API", () => {
    expect(toErrorResult(new NotFoundError("x")).status).toBe(404);
    expect(toErrorResult(new ConflictError("x")).status).toBe(409);
    expect(toErrorResult(new DuplicateNameError("x")).status).toBe(409);
    expect(toErrorResult(new DomainError("x")).status).toBe(400);
    expect(toErrorResult("??").status).toBe(500);
  });
});

describe("changesRunningTask", () => {
  it("só as ops de tarefa em execução esperam o render seguinte", () => {
    expect(changesRunningTask("tasks.stop")).toBe(true);
    expect(changesRunningTask("plannedTasks.create")).toBe(false);
    expect(changesRunningTask("status.get")).toBe(false);
  });
});
