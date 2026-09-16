import { describe, it, expect } from "vitest";
import type { Task } from "@domain/entities/Task";
import { dispatchLocalApiRequest } from "@presentation/localApi/dispatch";
import { endOfDayISO, startOfDayISO } from "@shared/utils/time";
import { localISO } from "../../../helpers/localTime";
import { makeDeps, makeTask, NOW, TODAY, WS_ATIVO, WS_OUTRO } from "../fakeDeps";

const concluida = (overrides: Partial<Task> = {}) =>
  makeTask({
    status: "completed",
    startTime: localISO(2026, 9, 15, 8),
    endTime: localISO(2026, 9, 15, 9),
    durationSeconds: 3600,
    ...overrides,
  });

function depsCom(tasks: Task[], running?: Parameters<typeof makeDeps>[0]) {
  const deps = makeDeps(running);
  deps.taskRepo.findById.mockImplementation(async (id) => tasks.find((t) => t.id === id) ?? null);
  deps.taskRepo.findByDateRange.mockResolvedValue(tasks);
  return deps;
}

describe("history.list", () => {
  it("busca hoje no workspace ativo, só concluídas, da mais recente para a mais antiga", async () => {
    const cedo = concluida({ id: "cedo", projectId: "proj-ativo" });
    const tarde = concluida({ id: "tarde", startTime: localISO(2026, 9, 15, 14) });
    const deps = depsCom([cedo, tarde, makeTask({ id: "rodando" })]);

    const result = await dispatchLocalApiRequest(deps, "history.list", {});

    expect(deps.taskRepo.findByDateRange).toHaveBeenCalledWith(
      startOfDayISO(TODAY),
      endOfDayISO(TODAY),
      WS_ATIVO
    );
    expect(result.status).toBe(200);
    const body = result.body as { id: string; projectName?: string }[];
    expect(body.map((t) => t.id)).toEqual(["tarde", "cedo"]);
    expect(body[1]).toMatchObject({
      projectName: "Cliente",
      customValues: {},
      plannedTaskId: null,
    });
  });

  it("aplica período, nome, billable e projeto no workspace informado", async () => {
    const deps = depsCom([
      concluida({ id: "a", name: "Daily", billable: false, projectId: "proj-ativo" }),
      concluida({ id: "b", name: "Daily", billable: true, projectId: "proj-ativo" }),
    ]);
    const result = await dispatchLocalApiRequest(deps, "history.list", {
      from: "2026-09-01",
      to: "2026-09-15",
      name: "dai",
      billable: "false",
      projectId: "proj-ativo",
      workspaceId: WS_OUTRO,
    });
    expect(deps.taskRepo.findByDateRange).toHaveBeenCalledWith(
      startOfDayISO("2026-09-01"),
      endOfDayISO("2026-09-15"),
      WS_OUTRO
    );
    expect(deps.projectRepo.findAll).toHaveBeenCalledWith(WS_OUTRO);
    expect((result.body as { id: string }[]).map((t) => t.id)).toEqual(["a"]);
  });

  it("devolve 400 para data, período ou billable fora do formato", async () => {
    const deps = makeDeps();
    for (const params of [
      { from: "15/09/2026" },
      { from: "2026-09-15", to: "2026-09-01" },
      { billable: "sim" },
    ]) {
      expect((await dispatchLocalApiRequest(deps, "history.list", params)).status).toBe(400);
    }
  });

  it("devolve 409 para projeto de outro workspace e para workspace inexistente", async () => {
    const deps = makeDeps();
    const projeto = await dispatchLocalApiRequest(deps, "history.list", { projectId: "proj-x" });
    const ws = await dispatchLocalApiRequest(deps, "history.list", { workspaceId: "ws-x" });
    expect(projeto.status).toBe(409);
    expect(ws.status).toBe(409);
  });
});

describe("history.get", () => {
  it("devolve a tarefa com os nomes do catálogo do workspace dela", async () => {
    const deps = depsCom([concluida({ categoryId: "cat-ativo" })]);
    const result = await dispatchLocalApiRequest(deps, "history.get", { id: "t-1" });
    expect(result.status).toBe(200);
    expect(result.body).toMatchObject({ id: "t-1", categoryName: "Reuniões" });
  });

  it("devolve 404 para id inexistente", async () => {
    const result = await dispatchLocalApiRequest(makeDeps(), "history.get", { id: "x" });
    expect(result.status).toBe(404);
  });
});

describe("history.create", () => {
  const corpo = {
    name: " Reunião ",
    projectName: "Cliente",
    billable: false,
    startTime: localISO(2026, 9, 14, 9),
    endTime: localISO(2026, 9, 14, 10, 30),
    customValues: { "f-1": "o-1" },
  };

  it("lança a tarefa concluída no workspace ativo e avisa as janelas", async () => {
    const deps = makeDeps();
    const result = await dispatchLocalApiRequest(deps, "history.create", { body: corpo });
    const salva = deps.taskRepo.save.mock.calls[0][0] as Task;
    expect(result.status).toBe(201);
    expect(salva).toMatchObject({
      workspaceId: WS_ATIVO,
      name: "Reunião",
      projectId: "proj-ativo",
      billable: false,
      status: "completed",
      durationSeconds: 5400,
      customValues: { "f-1": "o-1" },
      createdAt: NOW,
    });
    expect(deps.notifyTasksChanged).toHaveBeenCalled();
  });

  it("resolve projeto por nome no workspace informado", async () => {
    const deps = makeDeps();
    const result = await dispatchLocalApiRequest(deps, "history.create", {
      body: { ...corpo, workspaceId: WS_OUTRO },
    });
    expect(deps.projectRepo.findByName).toHaveBeenCalledWith("Cliente", WS_OUTRO);
    expect(result.status).toBe(409);
    expect(deps.taskRepo.save).not.toHaveBeenCalled();
    expect(deps.notifyTasksChanged).not.toHaveBeenCalled();
  });

  it("devolve 400 com duração menor que 1 minuto ou instante inválido", async () => {
    const deps = makeDeps();
    const curta = await dispatchLocalApiRequest(deps, "history.create", {
      body: { ...corpo, endTime: localISO(2026, 9, 14, 9, 0, 30) },
    });
    const invalida = await dispatchLocalApiRequest(deps, "history.create", {
      body: { ...corpo, startTime: "2026-09-14" },
    });
    expect(curta).toEqual({ status: 400, body: { error: "A duração mínima é 1 minuto." } });
    expect(invalida.status).toBe(400);
    expect(deps.taskRepo.save).not.toHaveBeenCalled();
  });

  it("projeto inexistente vence a duração curta: 409, pois o mínimo só é checado ao gravar", async () => {
    const deps = makeDeps();
    const result = await dispatchLocalApiRequest(deps, "history.create", {
      body: {
        ...corpo,
        projectName: "Projeto que não existe",
        endTime: localISO(2026, 9, 14, 9, 0, 30),
      },
    });
    expect(result.status).toBe(409);
    expect(deps.taskRepo.save).not.toHaveBeenCalled();
    expect(deps.notifyTasksChanged).not.toHaveBeenCalled();
  });
});

describe("history.update", () => {
  it("edita só o que veio, recalcula a duração e propaga o billable ao grupo", async () => {
    const alvo = concluida({ id: "alvo", projectId: "proj-ativo", billable: true });
    const irma = concluida({ id: "irma", projectId: "proj-ativo", billable: true });
    const deps = depsCom([alvo, irma]);

    const result = await dispatchLocalApiRequest(deps, "history.update", {
      id: "alvo",
      body: { billable: false, endTime: localISO(2026, 9, 15, 9, 30) },
    });

    expect(result.status).toBe(200);
    const gravadas = deps.taskRepo.update.mock.calls.map((c) => c[0] as Task);
    expect(gravadas[0]).toMatchObject({
      id: "alvo",
      projectId: "proj-ativo",
      billable: false,
      durationSeconds: 5400,
      updatedAt: NOW,
    });
    expect(gravadas.some((t) => t.id === "irma" && t.billable === false)).toBe(true);
    expect(deps.notifyTasksChanged).toHaveBeenCalled();
  });

  it("null limpa projeto e o nome resolve no workspace da tarefa", async () => {
    const deps = depsCom([concluida({ workspaceId: WS_OUTRO, projectId: "p-outro" })]);
    await dispatchLocalApiRequest(deps, "history.update", {
      id: "t-1",
      body: { projectId: null, categoryName: "Reuniões" },
    });
    expect(deps.categoryRepo.findByName).toHaveBeenCalledWith("Reuniões", WS_OUTRO);
  });

  it("limpa o projeto com null", async () => {
    const deps = depsCom([concluida({ projectId: "proj-ativo" })]);
    await dispatchLocalApiRequest(deps, "history.update", { id: "t-1", body: { projectId: null } });
    expect(deps.taskRepo.update.mock.calls[0][0]).toMatchObject({ projectId: null });
  });

  it("devolve 409 para tarefa em execução ou pausada sem gravar", async () => {
    for (const status of ["running", "paused"] as const) {
      const deps = depsCom([makeTask({ status })]);
      const result = await dispatchLocalApiRequest(deps, "history.update", {
        id: "t-1",
        body: { name: "x" },
      });
      expect(result.status).toBe(409);
      expect((result.body as { error: string }).error).toContain("PATCH /tasks/active");
      expect(deps.taskRepo.update).not.toHaveBeenCalled();
      expect(deps.notifyTasksChanged).not.toHaveBeenCalled();
    }
  });

  it("devolve 404 para id inexistente e 400 para fim antes do início", async () => {
    const deps = depsCom([concluida()]);
    const nada = await dispatchLocalApiRequest(deps, "history.update", { id: "x", body: {} });
    const invertida = await dispatchLocalApiRequest(deps, "history.update", {
      id: "t-1",
      body: { endTime: localISO(2026, 9, 15, 7) },
    });
    expect(nada.status).toBe(404);
    expect(invertida.status).toBe(400);
    expect(deps.taskRepo.update).not.toHaveBeenCalled();
  });
});

describe("history.delete", () => {
  it("exclui a tarefa concluída e avisa as janelas", async () => {
    const deps = depsCom([concluida()]);
    const result = await dispatchLocalApiRequest(deps, "history.delete", { id: "t-1" });
    expect(result).toEqual({ status: 204, body: null });
    expect(deps.taskRepo.delete).toHaveBeenCalledWith("t-1");
    expect(deps.notifyTasksChanged).toHaveBeenCalled();
  });

  it("devolve 409 para tarefa ativa e 404 para inexistente", async () => {
    const deps = depsCom([makeTask({ status: "paused" })]);
    const ativa = await dispatchLocalApiRequest(deps, "history.delete", { id: "t-1" });
    const nada = await dispatchLocalApiRequest(deps, "history.delete", { id: "x" });
    expect(ativa.status).toBe(409);
    expect((ativa.body as { error: string }).error).toContain("POST /tasks/cancel");
    expect(nada.status).toBe(404);
    expect(deps.taskRepo.delete).not.toHaveBeenCalled();
  });
});

describe("history.setBillable", () => {
  it("alterna o grupo inteiro e devolve a tarefa relida", async () => {
    const alvo = concluida({ id: "alvo" });
    const irma = concluida({ id: "irma" });
    const deps = depsCom([alvo, irma]);
    const result = await dispatchLocalApiRequest(deps, "history.setBillable", {
      id: "alvo",
      body: { billable: false },
    });
    expect(result.status).toBe(200);
    expect(deps.taskRepo.update.mock.calls.map((c) => (c[0] as Task).id).sort()).toEqual([
      "alvo",
      "irma",
    ]);
    expect(deps.notifyTasksChanged).toHaveBeenCalled();
  });

  it("devolve 409 para tarefa ativa e 400 sem booleano", async () => {
    const ativa = depsCom([makeTask()]);
    const concl = depsCom([concluida()]);
    expect(
      (
        await dispatchLocalApiRequest(ativa, "history.setBillable", {
          id: "t-1",
          body: { billable: true },
        })
      ).status
    ).toBe(409);
    expect(
      (await dispatchLocalApiRequest(concl, "history.setBillable", { id: "t-1", body: {} })).status
    ).toBe(400);
    expect(concl.notifyTasksChanged).not.toHaveBeenCalled();
  });
});

describe("history.update — billable pela categoria (§6.2)", () => {
  it("categoria nova sem billable aplica o defaultBillable dela", async () => {
    const deps = depsCom([concluida({ billable: true })]);
    await dispatchLocalApiRequest(deps, "history.update", {
      id: "t-1",
      body: { categoryName: "Reuniões" },
    });
    expect(deps.taskRepo.update.mock.calls[0][0]).toMatchObject({
      categoryId: "cat-ativo",
      billable: false,
    });
  });

  it("billable enviado vence o defaultBillable", async () => {
    const deps = depsCom([concluida({ billable: false })]);
    await dispatchLocalApiRequest(deps, "history.update", {
      id: "t-1",
      body: { categoryId: "cat-ativo", billable: true },
    });
    expect(deps.taskRepo.update.mock.calls[0][0]).toMatchObject({ billable: true });
  });

  it("categoria limpa sem billable preserva o atual", async () => {
    const deps = depsCom([concluida({ categoryId: "cat-ativo", billable: true })]);
    await dispatchLocalApiRequest(deps, "history.update", {
      id: "t-1",
      body: { categoryId: null },
    });
    expect(deps.taskRepo.update.mock.calls[0][0]).toMatchObject({
      categoryId: null,
      billable: true,
    });
  });
});

describe("history — validações de formato", () => {
  it("POST sem billable booleano devolve 400", async () => {
    const deps = makeDeps();
    const result = await dispatchLocalApiRequest(deps, "history.create", {
      body: { startTime: localISO(2026, 9, 14, 9), endTime: localISO(2026, 9, 14, 10) },
    });
    expect(result).toEqual({ status: 400, body: { error: "billable deve ser true ou false" } });
    expect(deps.taskRepo.save).not.toHaveBeenCalled();
  });

  it.each([{ startTime: null }, { endTime: null }])(
    "PUT com %o devolve 400 sem gravar",
    async (body) => {
      const deps = depsCom([concluida()]);
      const result = await dispatchLocalApiRequest(deps, "history.update", { id: "t-1", body });
      expect(result.status).toBe(400);
      expect(deps.taskRepo.update).not.toHaveBeenCalled();
      expect(deps.notifyTasksChanged).not.toHaveBeenCalled();
    }
  );
});
