import { describe, it, expect } from "vitest";
import {
  dispatchLocalApiRequest,
  LOCAL_API_OPS,
  runsInLongQueue,
  waitsForNextCommit,
} from "@presentation/localApi/dispatch";
import { toErrorResult, NotFoundError, ConflictError } from "@presentation/localApi/errors";
import { DomainError, DuplicateNameError } from "@shared/errors";
import { makeDeps, makeTask } from "./fakeDeps";
import longOps from "../../../../src-tauri/long-ops.json";

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

describe("waitsForNextCommit", () => {
  it("só as ops que mexem na tarefa em execução ou nos workspaces esperam o render seguinte", () => {
    expect(waitsForNextCommit("tasks.stop")).toBe(true);
    expect(waitsForNextCommit("workspaces.setActive")).toBe(true);
    expect(waitsForNextCommit("workspaces.delete")).toBe(true);
    expect(waitsForNextCommit("workspaces.list")).toBe(false);
    expect(waitsForNextCommit("projects.create")).toBe(false);
    expect(waitsForNextCommit("plannedTasks.create")).toBe(false);
    expect(waitsForNextCommit("status.get")).toBe(false);
    expect(waitsForNextCommit("tasks.updateActive")).toBe(true);
    expect(waitsForNextCommit("tasks.startPlanned")).toBe(true);
    expect(waitsForNextCommit("plannedTasks.launchRetroactive")).toBe(false);
    expect(waitsForNextCommit("plannedTasks.duplicate")).toBe(false);
    expect(waitsForNextCommit("history.update")).toBe(false);
    expect(waitsForNextCommit("totals.week")).toBe(false);
    // Fase D3a: "Iniciar agora" do link troca a tarefa; configurações não.
    expect(waitsForNextCommit("share.apply")).toBe(true);
    expect(waitsForNextCommit("share.preview")).toBe(false);
    expect(waitsForNextCommit("settings.updateGeneral")).toBe(false);
    expect(waitsForNextCommit("settings.updateAccessibility")).toBe(false);
    expect(waitsForNextCommit("overlay.toggle")).toBe(false);
    // Fase D3b: ajustes de integração só gravam config e catálogo; trocar o
    // workspace de uma integração não troca o ativo.
    expect(waitsForNextCommit("settings.updateMonday")).toBe(false);
    expect(waitsForNextCommit("clockify.importProjects")).toBe(false);
    expect(waitsForNextCommit("integrations.syncNow")).toBe(false);
  });
});

// O Rust confere a `LONG_OPS` dele contra o mesmo arquivo (`bridge.rs`).
describe("runsInLongQueue", () => {
  it("vale exatamente para as ops de src-tauri/long-ops.json", () => {
    expect(longOps.every((op) => LOCAL_API_OPS.includes(op))).toBe(true);
    for (const op of LOCAL_API_OPS) {
      expect(runsInLongQueue(op), op).toBe(longOps.includes(op));
    }
  });
});
