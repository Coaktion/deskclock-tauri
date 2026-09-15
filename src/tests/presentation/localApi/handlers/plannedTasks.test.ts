import { describe, it, expect, vi } from "vitest";
import type { PlannedTask } from "@domain/entities/PlannedTask";
import type { Task } from "@domain/entities/Task";
import { dispatchLocalApiRequest } from "@presentation/localApi/dispatch";
import { localISO } from "../../../helpers/localTime";
import { makeDeps, makePlanned, makeTask, TODAY, WS_ATIVO, WS_OUTRO } from "../fakeDeps";

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

  it("sem data lista todas as do workspace informado pelo findAll", async () => {
    const deps = makeDeps();
    deps.plannedTaskRepo.findAll.mockResolvedValue([
      makePlanned({ workspaceId: WS_OUTRO, scheduleType: "period", scheduleDate: null }),
    ]);
    const result = await dispatchLocalApiRequest(deps, "plannedTasks.list", {
      workspaceId: WS_OUTRO,
    });
    expect(deps.plannedTaskRepo.findAll).toHaveBeenCalledWith(WS_OUTRO);
    expect(deps.plannedTaskRepo.findForWeek).not.toHaveBeenCalled();
    expect(result.body).toHaveLength(1);
  });

  it("com from e to usa a janela da semana do domínio", async () => {
    const deps = makeDeps();
    await dispatchLocalApiRequest(deps, "plannedTasks.list", {
      from: "2026-09-14",
      to: "2026-09-18",
    });
    expect(deps.plannedTaskRepo.findForWeek).toHaveBeenCalledWith(
      "2026-09-14",
      "2026-09-18",
      WS_ATIVO
    );
  });

  it("com só from ou só to usa o mesmo dia nas duas pontas", async () => {
    const deps = makeDeps();
    await dispatchLocalApiRequest(deps, "plannedTasks.list", { to: "2026-09-18" });
    expect(deps.plannedTaskRepo.findForWeek).toHaveBeenCalledWith(
      "2026-09-18",
      "2026-09-18",
      WS_ATIVO
    );
  });

  it.each([
    [{ from: "2026-09-18", to: "2026-09-14" }],
    [{ from: "14/09/2026" }],
    [{ date: TODAY, from: TODAY }],
  ])("recusa período inválido %j com 400", async (params) => {
    const deps = makeDeps();
    const result = await dispatchLocalApiRequest(deps, "plannedTasks.list", params);
    expect(result.status).toBe(400);
  });

  it("recusa data fora do formato com 400", async () => {
    const deps = makeDeps();
    const result = await dispatchLocalApiRequest(deps, "plannedTasks.list", { date: "15/09/2026" });
    expect(result.status).toBe(400);
  });
});

describe("plannedTasks.create", () => {
  it("grava no workspace ativo com sortOrder 0, como o app, e avisa as janelas", async () => {
    const deps = makeDeps();

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
      sortOrder: 0,
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

describe("plannedTasks.create com sortOrder explícito", () => {
  it("mantém o valor enviado", async () => {
    const deps = makeDeps();
    await dispatchLocalApiRequest(deps, "plannedTasks.create", {
      body: { ...BODY_MINIMO, sortOrder: 7 },
    });
    const saved = deps.plannedTaskRepo.save.mock.calls[0][0] as unknown as PlannedTask;
    expect(saved.sortOrder).toBe(7);
  });
});

describe("plannedTasks.duplicate", () => {
  it("cria a cópia sem conclusões, devolve 201 e avisa as janelas", async () => {
    const deps = makeDeps();
    deps.plannedTaskRepo.findById.mockResolvedValue(
      makePlanned({ completedDates: [TODAY], customValues: { f: "x" } })
    );
    const result = await dispatchLocalApiRequest(deps, "plannedTasks.duplicate", { id: "p-1" });
    const saved = deps.plannedTaskRepo.save.mock.calls[0][0] as unknown as PlannedTask;
    expect(result.status).toBe(201);
    expect(saved.id).not.toBe("p-1");
    expect(saved).toMatchObject({
      name: "Planejada",
      completedDates: [],
      customValues: { f: "x" },
    });
    expect(result.body).toMatchObject({ id: saved.id, completedDates: [] });
    expect(deps.notifyPlannedTasksChanged).toHaveBeenCalled();
  });

  it("devolve 404 sem gravar para planejada inexistente", async () => {
    const deps = makeDeps();
    const result = await dispatchLocalApiRequest(deps, "plannedTasks.duplicate", { id: "x" });
    expect(result.status).toBe(404);
    expect(deps.plannedTaskRepo.save).not.toHaveBeenCalled();
    expect(deps.notifyPlannedTasksChanged).not.toHaveBeenCalled();
  });
});

describe("tasks.startPlanned", () => {
  const planejada = makePlanned({
    workspaceId: WS_OUTRO,
    projectId: "proj-x",
    categoryId: "cat-x",
    billable: false,
    customValues: { stage: "dev" },
  });

  it("inicia pelo contexto com o vínculo e os dados da planejada, no workspace dela", async () => {
    const iniciada = makeTask({ id: "t-nova", workspaceId: WS_OUTRO, plannedTaskId: "p-1" });
    const deps = makeDeps({ running: { startTask: vi.fn(async () => iniciada) } });
    deps.plannedTaskRepo.findById.mockResolvedValue(planejada);

    const result = await dispatchLocalApiRequest(deps, "tasks.startPlanned", { id: "p-1" });

    expect(deps.running.startTask).toHaveBeenCalledWith({
      workspaceId: WS_OUTRO,
      name: "Planejada",
      projectId: "proj-x",
      categoryId: "cat-x",
      billable: false,
      plannedTaskId: "p-1",
      customValues: { stage: "dev" },
    });
    expect(deps.running.switchToTask).not.toHaveBeenCalled();
    expect(result.status).toBe(201);
    expect(result.body).toMatchObject({ id: "t-nova", plannedTaskId: "p-1" });
  });

  it.each(["running", "paused"] as const)(
    "devolve 409 com tarefa %s e não inicia nada",
    async (status) => {
      const deps = makeDeps({ running: { runningTask: makeTask({ status }) } });
      deps.plannedTaskRepo.findById.mockResolvedValue(planejada);
      const result = await dispatchLocalApiRequest(deps, "tasks.startPlanned", { id: "p-1" });
      expect(result.status).toBe(409);
      expect(deps.running.startTask).not.toHaveBeenCalled();
    }
  );

  it("devolve 409 quando o contexto recusa por outro início em curso", async () => {
    const deps = makeDeps();
    deps.plannedTaskRepo.findById.mockResolvedValue(planejada);
    const result = await dispatchLocalApiRequest(deps, "tasks.startPlanned", { id: "p-1" });
    expect(result.status).toBe(409);
  });

  it("devolve 404 para planejada inexistente", async () => {
    const deps = makeDeps();
    const result = await dispatchLocalApiRequest(deps, "tasks.startPlanned", { id: "x" });
    expect(result.status).toBe(404);
    expect(deps.running.startTask).not.toHaveBeenCalled();
  });
});

describe("plannedTasks.launchRetroactive", () => {
  function depsAgendada(planned: PlannedTask) {
    const deps = makeDeps();
    deps.plannedTaskRepo.findById.mockResolvedValue(planned);
    deps.plannedTaskRepo.findForDate.mockResolvedValue([planned]);
    return deps;
  }

  const comHorario = makePlanned({
    startTime: "09:00",
    endTime: "10:30",
    customValues: { stage: "dev" },
  });
  const semHorario = makePlanned({ billable: false, customValues: { stage: "qa" } });

  it("com horário usa o horário da planejada, conclui no dia e avisa tarefas e planejadas", async () => {
    const deps = depsAgendada(comHorario);

    const result = await dispatchLocalApiRequest(deps, "plannedTasks.launchRetroactive", {
      id: "p-1",
      body: null,
    });

    const saved = deps.taskRepo.save.mock.calls[0][0] as unknown as Task;
    expect(result.status).toBe(201);
    expect(saved).toMatchObject({
      workspaceId: WS_ATIVO,
      status: "completed",
      startTime: localISO(2026, 9, 15, 9),
      endTime: localISO(2026, 9, 15, 10, 30),
      durationSeconds: 5400,
      customValues: { stage: "dev" },
    });
    expect(deps.plannedTaskRepo.findForDate).toHaveBeenCalledWith(TODAY, WS_ATIVO);
    expect(deps.plannedTaskRepo.complete).toHaveBeenCalledWith("p-1", TODAY);
    expect(deps.notifyTasksChanged).toHaveBeenCalled();
    expect(deps.notifyPlannedTasksChanged).toHaveBeenCalled();
  });

  it("com horário recusa startTime/endTime no corpo com 400", async () => {
    const deps = depsAgendada(comHorario);
    const result = await dispatchLocalApiRequest(deps, "plannedTasks.launchRetroactive", {
      id: "p-1",
      body: { startTime: localISO(2026, 9, 15, 8) },
    });
    expect(result.status).toBe(400);
    expect(deps.taskRepo.save).not.toHaveBeenCalled();
  });

  it("sem horário grava o intervalo do corpo com os dados da planejada e conclui na data", async () => {
    const planned = makePlanned({ ...semHorario, scheduleDate: "2026-09-14" });
    const deps = depsAgendada(planned);

    const result = await dispatchLocalApiRequest(deps, "plannedTasks.launchRetroactive", {
      id: "p-1",
      body: {
        date: "2026-09-14",
        startTime: localISO(2026, 9, 14, 23, 30),
        endTime: localISO(2026, 9, 15, 0, 15),
      },
    });

    const saved = deps.taskRepo.save.mock.calls[0][0] as unknown as Task;
    expect(result.status).toBe(201);
    expect(saved).toMatchObject({
      name: "Planejada",
      billable: false,
      durationSeconds: 2700,
      customValues: { stage: "qa" },
    });
    expect(deps.plannedTaskRepo.complete).toHaveBeenCalledWith("p-1", "2026-09-14");
  });

  it.each([
    ["sem startTime/endTime", {}],
    [
      "com menos de 1 minuto",
      { startTime: localISO(2026, 9, 15, 9), endTime: localISO(2026, 9, 15, 9, 0, 30) },
    ],
    [
      "com início fora do dia",
      { startTime: localISO(2026, 9, 14, 9), endTime: localISO(2026, 9, 15, 10) },
    ],
    ["com instante inválido", { startTime: "09:00", endTime: "10:00" }],
    ["com data futura", { date: "2026-09-16" }],
    ["com data fora do formato", { date: "16/09/2026" }],
    ["com data vazia", { date: "" }],
  ])("sem horário devolve 400 %s", async (_caso, body) => {
    const deps = depsAgendada(semHorario);
    const result = await dispatchLocalApiRequest(deps, "plannedTasks.launchRetroactive", {
      id: "p-1",
      body,
    });
    expect(result.status).toBe(400);
    expect(deps.taskRepo.save).not.toHaveBeenCalled();
    expect(deps.plannedTaskRepo.complete).not.toHaveBeenCalled();
  });

  it("checa a agenda e grava no workspace da planejada, não no ativo", async () => {
    const deps = depsAgendada(makePlanned({ ...comHorario, workspaceId: WS_OUTRO }));

    const result = await dispatchLocalApiRequest(deps, "plannedTasks.launchRetroactive", {
      id: "p-1",
    });

    const saved = deps.taskRepo.save.mock.calls[0][0] as unknown as Task;
    expect(result.status).toBe(201);
    expect(deps.plannedTaskRepo.findForDate).toHaveBeenCalledWith(TODAY, WS_OUTRO);
    expect(saved.workspaceId).toBe(WS_OUTRO);
  });

  it("devolve 409 quando a planejada não está agendada para a data", async () => {
    const deps = makeDeps();
    deps.plannedTaskRepo.findById.mockResolvedValue(comHorario);
    const result = await dispatchLocalApiRequest(deps, "plannedTasks.launchRetroactive", {
      id: "p-1",
      body: { date: "2026-09-10" },
    });
    expect(result.status).toBe(409);
    expect(deps.taskRepo.save).not.toHaveBeenCalled();
  });

  it("devolve 409 quando já foi concluída na data", async () => {
    const deps = depsAgendada(makePlanned({ ...comHorario, completedDates: [TODAY] }));
    const result = await dispatchLocalApiRequest(deps, "plannedTasks.launchRetroactive", {
      id: "p-1",
    });
    expect(result.status).toBe(409);
    expect(deps.taskRepo.save).not.toHaveBeenCalled();
  });

  it("devolve 404 para planejada inexistente", async () => {
    const deps = makeDeps();
    const result = await dispatchLocalApiRequest(deps, "plannedTasks.launchRetroactive", {
      id: "x",
    });
    expect(result.status).toBe(404);
  });
});
