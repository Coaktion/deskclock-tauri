import { describe, it, expect } from "vitest";
import type { Task } from "@domain/entities/Task";
import { dispatchLocalApiRequest } from "@presentation/localApi/dispatch";
import { localISO } from "../../../helpers/localTime";
import { makeDeps, makeTask, WS_ATIVO, WS_OUTRO } from "../fakeDeps";

const concluida = (id: string, overrides: Partial<Task> = {}) =>
  makeTask({
    id,
    status: "completed",
    startTime: localISO(2026, 9, 15, 8),
    endTime: localISO(2026, 9, 15, 9),
    durationSeconds: 3600,
    ...overrides,
  });

function depsCom(tasks: Task[]) {
  const deps = makeDeps();
  deps.taskRepo.findById.mockImplementation(async (id) => tasks.find((t) => t.id === id) ?? null);
  return deps;
}

describe("history.deleteMany", () => {
  it("exclui todas de uma vez e avisa as janelas", async () => {
    const deps = depsCom([concluida("a"), concluida("b")]);
    const result = await dispatchLocalApiRequest(deps, "history.deleteMany", {
      body: { ids: ["a", "b", "a"] },
    });
    expect(result.status).toBe(204);
    expect(deps.taskRepo.deleteMany).toHaveBeenCalledWith(["a", "b"]);
    expect(deps.notifyTasksChanged).toHaveBeenCalled();
  });

  it("não exclui nada se algum id falta (404) ou está ativo (409)", async () => {
    const deps = depsCom([concluida("a"), makeTask({ id: "rodando" })]);
    const falta = await dispatchLocalApiRequest(deps, "history.deleteMany", {
      body: { ids: ["a", "x"] },
    });
    const ativa = await dispatchLocalApiRequest(deps, "history.deleteMany", {
      body: { ids: ["a", "rodando"] },
    });
    expect(falta).toEqual({ status: 404, body: { error: "Tarefas não encontradas: x" } });
    expect(ativa.status).toBe(409);
    expect(deps.taskRepo.deleteMany).not.toHaveBeenCalled();
    expect(deps.notifyTasksChanged).not.toHaveBeenCalled();
  });
});

describe("history.merge", () => {
  it("unifica um grupo com a duração somada", async () => {
    const deps = depsCom([
      concluida("a", { customValues: { f: "1" } }),
      concluida("b", { startTime: localISO(2026, 9, 15, 14), customValues: { f: "1" } }),
    ]);
    const result = await dispatchLocalApiRequest(deps, "history.merge", {
      body: { ids: ["a", "b"] },
    });
    expect(result.status).toBe(201);
    expect(result.body).toMatchObject({ durationSeconds: 7200, workspaceId: WS_ATIVO });
    expect(deps.taskRepo.deleteMany).toHaveBeenCalledWith(["a", "b"]);
    expect(deps.notifyTasksChanged).toHaveBeenCalled();
  });

  it.each([
    ["dia", { startTime: localISO(2026, 9, 14, 8) }],
    ["workspace", { workspaceId: WS_OUTRO }],
    ["nome", { name: "Outra" }],
    ["campo personalizado", { customValues: { f: "2" } }],
  ])("devolve 409 quando o %s difere", async (_label, diff) => {
    const deps = depsCom([concluida("a"), concluida("b", diff)]);
    const result = await dispatchLocalApiRequest(deps, "history.merge", {
      body: { ids: ["a", "b"] },
    });
    expect(result.status).toBe(409);
    expect(deps.taskRepo.save).not.toHaveBeenCalled();
    expect(deps.notifyTasksChanged).not.toHaveBeenCalled();
  });

  it("devolve 400 com menos de duas, 404 para id inexistente e 409 para ativa", async () => {
    const deps = depsCom([concluida("a"), makeTask({ id: "rodando", status: "paused" })]);
    const uma = await dispatchLocalApiRequest(deps, "history.merge", { body: { ids: ["a", "a"] } });
    const falta = await dispatchLocalApiRequest(deps, "history.merge", {
      body: { ids: ["a", "x"] },
    });
    const ativa = await dispatchLocalApiRequest(deps, "history.merge", {
      body: { ids: ["a", "rodando"] },
    });
    expect([uma.status, falta.status, ativa.status]).toEqual([400, 404, 409]);
    expect(deps.taskRepo.save).not.toHaveBeenCalled();
  });
});

describe("history.move", () => {
  const plano = {
    ids: ["a"],
    toWorkspaceId: WS_OUTRO,
    project: { kind: "create", name: " Cliente " },
    category: { kind: "unset" },
    mode: "move",
  };

  it("move reconciliando o catálogo e avisa tarefas e projetos", async () => {
    const deps = depsCom([concluida("a", { projectId: "proj-ativo" })]);
    deps.projectRepo.findAll.mockResolvedValue([]);
    const result = await dispatchLocalApiRequest(deps, "history.move", { body: plano });
    expect(result).toEqual({ status: 200, body: { count: 1 } });
    const novoProjeto = deps.projectRepo.save.mock.calls[0][0] as {
      id: string;
      name: string;
      workspaceId: string;
    };
    expect(novoProjeto).toMatchObject({ name: "Cliente", workspaceId: WS_OUTRO });
    expect(deps.taskRepo.update.mock.calls[0][0]).toMatchObject({
      id: "a",
      workspaceId: WS_OUTRO,
      projectId: novoProjeto.id,
      categoryId: null,
    });
    expect(deps.notifyTasksChanged).toHaveBeenCalled();
    expect(deps.notifyProjectsChanged).toHaveBeenCalled();
    expect(deps.notifyCategoriesChanged).not.toHaveBeenCalled();
  });

  it("copia com match sem criar catálogo", async () => {
    const deps = depsCom([concluida("a")]);
    deps.categoryRepo.findAll.mockResolvedValue([
      { id: "cat-destino", workspaceId: WS_OUTRO, name: "Reuniões", defaultBillable: true },
    ]);
    const result = await dispatchLocalApiRequest(deps, "history.move", {
      body: {
        ...plano,
        mode: "copy",
        project: { kind: "unset" },
        category: { kind: "match", targetId: "cat-destino" },
      },
    });
    expect(result.status).toBe(200);
    expect(deps.categoryRepo.findAll).toHaveBeenCalledWith(WS_OUTRO);
    expect(deps.taskRepo.save.mock.calls[0][0]).toMatchObject({ categoryId: "cat-destino" });
    expect(deps.notifyProjectsChanged).not.toHaveBeenCalled();
  });

  it("devolve 409 para destino inexistente, targetId fora do destino ou tarefa ativa", async () => {
    const deps = depsCom([concluida("a"), makeTask({ id: "rodando" })]);
    deps.projectRepo.findAll.mockResolvedValue([]);
    const destino = await dispatchLocalApiRequest(deps, "history.move", {
      body: { ...plano, toWorkspaceId: "ws-x" },
    });
    const alvo = await dispatchLocalApiRequest(deps, "history.move", {
      body: { ...plano, project: { kind: "match", targetId: "proj-ativo" } },
    });
    const ativa = await dispatchLocalApiRequest(deps, "history.move", {
      body: { ...plano, ids: ["rodando"] },
    });
    expect([destino.status, alvo.status, ativa.status]).toEqual([409, 409, 409]);
    expect(deps.taskRepo.update).not.toHaveBeenCalled();
    expect(deps.notifyTasksChanged).not.toHaveBeenCalled();
  });

  it("devolve 400 para mode inválido, destino igual à origem e create sem nome", async () => {
    const deps = depsCom([concluida("a")]);
    const modo = await dispatchLocalApiRequest(deps, "history.move", {
      body: { ...plano, mode: "x" },
    });
    const mesmo = await dispatchLocalApiRequest(deps, "history.move", {
      body: { ...plano, toWorkspaceId: WS_ATIVO },
    });
    const semNome = await dispatchLocalApiRequest(deps, "history.move", {
      body: { ...plano, project: { kind: "create", name: " " } },
    });
    expect([modo.status, mesmo.status, semNome.status]).toEqual([400, 400, 400]);
    expect(deps.taskRepo.update).not.toHaveBeenCalled();
  });

  it("devolve 404 para id inexistente", async () => {
    const result = await dispatchLocalApiRequest(depsCom([]), "history.move", { body: plano });
    expect(result.status).toBe(404);
  });
});

describe("lotes com ids vazio", () => {
  it.each([
    ["history.deleteMany", { ids: [] }],
    ["history.merge", { ids: [] }],
    [
      "history.move",
      {
        ids: [],
        toWorkspaceId: WS_OUTRO,
        project: { kind: "create", name: "X" },
        category: { kind: "unset" },
        mode: "move",
      },
    ],
  ])("%s devolve 400 sem gravar nem avisar", async (op, body) => {
    const deps = depsCom([]);
    const result = await dispatchLocalApiRequest(deps, op, { body });
    expect(result.status).toBe(400);
    expect(deps.taskRepo.deleteMany).not.toHaveBeenCalled();
    expect(deps.projectRepo.save).not.toHaveBeenCalled();
    expect(deps.notifyTasksChanged).not.toHaveBeenCalled();
    expect(deps.notifyProjectsChanged).not.toHaveBeenCalled();
  });
});

describe("history.merge de dia passado", () => {
  it("devolve 409 e não unifica", async () => {
    const ontem = { startTime: localISO(2026, 9, 14, 8), endTime: localISO(2026, 9, 14, 9) };
    const deps = depsCom([concluida("a", ontem), concluida("b", ontem)]);
    const result = await dispatchLocalApiRequest(deps, "history.merge", {
      body: { ids: ["a", "b"] },
    });
    expect(result).toEqual({
      status: 409,
      body: { error: "Só é possível unificar as tarefas de hoje." },
    });
    expect(deps.taskRepo.save).not.toHaveBeenCalled();
    expect(deps.notifyTasksChanged).not.toHaveBeenCalled();
  });
});
