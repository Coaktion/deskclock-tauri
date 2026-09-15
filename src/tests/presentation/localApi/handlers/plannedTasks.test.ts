import { describe, it, expect } from "vitest";
import type { PlannedTask } from "@domain/entities/PlannedTask";
import { dispatchLocalApiRequest } from "@presentation/localApi/dispatch";
import { makeDeps, makePlanned, TODAY, WS_ATIVO, WS_OUTRO } from "../fakeDeps";

const BODY_MINIMO = {
  name: "Daily",
  billable: false,
  scheduleType: "recurring",
  recurringDays: [1],
};

describe("plannedTasks.list", () => {
  it("com ?date usa a regra do domínio no workspace ativo", async () => {
    const deps = makeDeps();
    deps.plannedTaskRepo.findForDate.mockResolvedValue([makePlanned()] as never);

    const result = await dispatchLocalApiRequest(deps, "plannedTasks.list", { date: TODAY });

    expect(deps.plannedTaskRepo.findForDate).toHaveBeenCalledWith(TODAY, WS_ATIVO);
    expect(result.body).toEqual([expect.objectContaining({ id: "p-1", workspaceId: WS_ATIVO })]);
  });

  it("sem data lista todas as do workspace informado", async () => {
    const deps = makeDeps();
    await dispatchLocalApiRequest(deps, "plannedTasks.list", { workspaceId: WS_OUTRO });
    expect(deps.plannedTaskRepo.findForWeek).toHaveBeenCalledWith(
      "0000-01-01",
      "9999-12-31",
      WS_OUTRO
    );
  });

  it("recusa data fora do formato com 400", async () => {
    const deps = makeDeps();
    const result = await dispatchLocalApiRequest(deps, "plannedTasks.list", { date: "15/09/2026" });
    expect(result.status).toBe(400);
  });
});

describe("plannedTasks.create", () => {
  it("grava no workspace ativo, depois da última da ordem, e avisa as janelas", async () => {
    const deps = makeDeps();
    deps.plannedTaskRepo.findForWeek.mockResolvedValue([makePlanned({ sortOrder: 4 })] as never);

    const result = await dispatchLocalApiRequest(deps, "plannedTasks.create", {
      body: {
        ...BODY_MINIMO,
        categoryName: "Reuniões",
        startTime: "09:00",
        customValues: { f: "x" },
      },
    });

    const saved = deps.plannedTaskRepo.save.mock.calls[0][0] as unknown as PlannedTask;
    expect(result.status).toBe(201);
    expect(saved).toMatchObject({
      workspaceId: WS_ATIVO,
      categoryId: "cat-ativo",
      sortOrder: 5,
      startTime: "09:00",
      customValues: { f: "x" },
    });
    expect(deps.notifyPlannedTasksChanged).toHaveBeenCalled();
  });

  it("devolve 409 quando a categoria não existe no workspace e não grava", async () => {
    const deps = makeDeps();
    const result = await dispatchLocalApiRequest(deps, "plannedTasks.create", {
      body: { ...BODY_MINIMO, workspaceId: WS_OUTRO, categoryName: "Reuniões" },
    });
    expect(result.status).toBe(409);
    expect(deps.plannedTaskRepo.save).not.toHaveBeenCalled();
  });

  it("recusa scheduleType desconhecido com 400", async () => {
    const deps = makeDeps();
    const result = await dispatchLocalApiRequest(deps, "plannedTasks.create", {
      body: { ...BODY_MINIMO, scheduleType: "weekly" },
    });
    expect(result.status).toBe(400);
  });
});

describe("plannedTasks.update", () => {
  const importada = makePlanned({
    startTime: "14:00",
    endTime: "15:00",
    customValues: { campo: "valor" },
    sortOrder: 3,
    completedDates: ["2026-09-01"],
    actions: [{ type: "open_url", value: "https://meet.example/x", label: "Meet" }],
  });

  it("preserva horário, campos personalizados e ordem quando o corpo não os traz", async () => {
    const deps = makeDeps();
    deps.plannedTaskRepo.findById.mockResolvedValue(importada as never);

    const result = await dispatchLocalApiRequest(deps, "plannedTasks.update", {
      id: "p-1",
      body: { ...BODY_MINIMO, actions: importada.actions },
    });

    const updated = deps.plannedTaskRepo.update.mock.calls[0][0] as unknown as PlannedTask;
    expect(result.status).toBe(200);
    expect(updated).toMatchObject({
      name: "Daily",
      startTime: "14:00",
      endTime: "15:00",
      customValues: { campo: "valor" },
      sortOrder: 3,
      completedDates: ["2026-09-01"],
      actions: [{ type: "open_url", value: "https://meet.example/x", label: "Meet" }],
    });
    expect(deps.notifyPlannedTasksChanged).toHaveBeenCalled();
  });

  it("remove o horário quando o corpo manda null", async () => {
    const deps = makeDeps();
    deps.plannedTaskRepo.findById.mockResolvedValue(importada as never);

    await dispatchLocalApiRequest(deps, "plannedTasks.update", {
      id: "p-1",
      body: { ...BODY_MINIMO, startTime: null, endTime: null },
    });

    const updated = deps.plannedTaskRepo.update.mock.calls[0][0] as unknown as PlannedTask;
    expect(updated.startTime).toBeUndefined();
    expect(updated.endTime).toBeUndefined();
  });

  it("limpa os campos personalizados quando o corpo manda null", async () => {
    const deps = makeDeps();
    deps.plannedTaskRepo.findById.mockResolvedValue(importada as never);

    await dispatchLocalApiRequest(deps, "plannedTasks.update", {
      id: "p-1",
      body: { ...BODY_MINIMO, customValues: null },
    });

    const updated = deps.plannedTaskRepo.update.mock.calls[0][0] as unknown as PlannedTask;
    expect(updated.customValues).toEqual({});
  });

  it("resolve o projeto no workspace da própria planejada", async () => {
    const deps = makeDeps();
    deps.plannedTaskRepo.findById.mockResolvedValue(
      makePlanned({ workspaceId: WS_OUTRO }) as never
    );

    const result = await dispatchLocalApiRequest(deps, "plannedTasks.update", {
      id: "p-1",
      body: { ...BODY_MINIMO, projectName: "Cliente" },
    });

    expect(deps.projectRepo.findByName).toHaveBeenCalledWith("Cliente", WS_OUTRO);
    expect(result.status).toBe(409);
  });

  it("devolve 404 para planejada inexistente", async () => {
    const deps = makeDeps();
    const result = await dispatchLocalApiRequest(deps, "plannedTasks.update", {
      id: "nao-existe",
      body: BODY_MINIMO,
    });
    expect(result).toEqual({
      status: 404,
      body: { error: "Tarefa planejada 'nao-existe' não encontrada" },
    });
  });
});

describe("plannedTasks.delete, complete e uncomplete", () => {
  it("exclui e avisa as janelas", async () => {
    const deps = makeDeps();
    deps.plannedTaskRepo.findById.mockResolvedValue(makePlanned() as never);
    const result = await dispatchLocalApiRequest(deps, "plannedTasks.delete", { id: "p-1" });
    expect(result.status).toBe(204);
    expect(deps.plannedTaskRepo.delete).toHaveBeenCalledWith("p-1");
    expect(deps.notifyPlannedTasksChanged).toHaveBeenCalled();
  });

  it("conclui hoje quando a data é omitida", async () => {
    const deps = makeDeps();
    deps.plannedTaskRepo.findById.mockResolvedValue(makePlanned() as never);
    const result = await dispatchLocalApiRequest(deps, "plannedTasks.complete", {
      id: "p-1",
      body: null,
    });
    expect(result.status).toBe(200);
    expect(deps.plannedTaskRepo.complete).toHaveBeenCalledWith("p-1", TODAY);
    expect(deps.notifyPlannedTasksChanged).toHaveBeenCalled();
  });

  it("desmarca a data do path", async () => {
    const deps = makeDeps();
    deps.plannedTaskRepo.findById.mockResolvedValue(makePlanned() as never);
    await dispatchLocalApiRequest(deps, "plannedTasks.uncomplete", {
      id: "p-1",
      date: "2026-09-01",
    });
    expect(deps.plannedTaskRepo.uncomplete).toHaveBeenCalledWith("p-1", "2026-09-01");
  });

  it("não emite aviso quando a planejada não existe", async () => {
    const deps = makeDeps();
    const result = await dispatchLocalApiRequest(deps, "plannedTasks.delete", { id: "x" });
    expect(result.status).toBe(404);
    expect(deps.notifyPlannedTasksChanged).not.toHaveBeenCalled();
  });
});
