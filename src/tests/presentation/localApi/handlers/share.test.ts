import { describe, expect, it, vi } from "vitest";
import type { CustomField } from "@domain/entities/CustomField";
import { dispatchLocalApiRequest } from "@presentation/localApi/dispatch";
import { buildShareLink } from "@shared/utils/shareLink";
import { makeDeps, makePlanned, makeTask, NOW, TODAY, WS_ATIVO } from "../fakeDeps";

const FIELD: CustomField = {
  id: "cf-etapa",
  label: "Etapa",
  type: "text",
  options: [],
  sortOrder: 0,
  archived: false,
  createdAt: NOW,
};

const LINK = buildShareLink({
  name: "Revisar PR",
  projectName: "cliente",
  categoryName: "Inexistente",
  billable: false,
  startTime: "09:00",
  endTime: "10:00",
  customValues: { Etapa: "Dev", Sumido: "x" },
});

function call(deps: ReturnType<typeof makeDeps>, op: string, body: unknown) {
  return dispatchLocalApiRequest(deps, op, { body });
}

describe("share.link", () => {
  it("gera o link da planejada e o payload que viaja — sem ids, agenda nem ações", async () => {
    const deps = makeDeps();
    deps.customFieldRepo.findAll.mockResolvedValue([{ ...FIELD, archived: true }]);
    deps.plannedTaskRepo.findById.mockResolvedValue(
      makePlanned({
        name: "  Revisar PR ",
        projectId: "proj-ativo",
        billable: false,
        scheduleType: "recurring",
        recurringDays: [1, 3],
        actions: [{ type: "open_url", value: "https://x" }],
        startTime: "09:00",
        customValues: { "cf-etapa": "Dev" },
      })
    );
    const result = await call(deps, "share.link", { plannedTaskId: "p-1" });
    expect(result.status).toBe(200);
    expect(result.body).toEqual({
      link: "deskclock://task/share?name=Revisar%20PR&project=Cliente&billable=false&start=09%3A00&cf.Etapa=Dev",
      payload: {
        name: "Revisar PR",
        projectName: "Cliente",
        categoryName: undefined,
        billable: false,
        startTime: "09:00",
        endTime: undefined,
        customValues: { Etapa: "Dev" },
      },
    });
    expect(deps.projectRepo.findAll).toHaveBeenCalledWith(WS_ATIVO);
  });

  it("sem id é 400; planejada inexistente é 404", async () => {
    const deps = makeDeps();
    expect((await call(deps, "share.link", {})).status).toBe(400);
    expect((await call(deps, "share.link", { plannedTaskId: "x" })).status).toBe(404);
  });
});

describe("share.preview", () => {
  it("resolve contra os catálogos do workspace e lista o que não casou", async () => {
    const deps = makeDeps();
    deps.customFieldRepo.findAll.mockResolvedValue([FIELD]);
    const result = await call(deps, "share.preview", { link: LINK });
    expect(result.status).toBe(200);
    expect(result.body).toMatchObject({
      workspaceId: WS_ATIVO,
      date: TODAY,
      task: {
        name: "Revisar PR",
        projectId: "proj-ativo",
        projectName: "Cliente",
        categoryId: null,
        categoryName: null,
        billable: false,
        startTime: "09:00",
        endTime: "10:00",
        customValues: { "cf-etapa": "Dev" },
      },
      unresolved: { projects: [], categories: ["Inexistente"], customFields: ["Sumido"] },
      activeTask: null,
      startWarning: null,
    });
  });

  it("com tarefa ativa, traz o aviso do modal", async () => {
    const deps = makeDeps({
      running: { runningTask: makeTask({ name: "Atual", status: "paused" }) },
    });
    const result = await call(deps, "share.preview", { link: LINK });
    expect(result.body).toMatchObject({
      startWarning: "Iniciar agora encerra a tarefa pausada “Atual”.",
    });
  });

  it.each([
    ["", "link é obrigatório."],
    ["https://x", "O link precisa começar com deskclock://"],
    ["deskclock://", "Falta o destino depois do prefixo."],
    ["deskclock://task/share?project=X", "Este link de tarefa não traz o nome da tarefa."],
  ])("link %j inválido → 400 com a mensagem da tela", async (link, error) => {
    const result = await call(makeDeps(), "share.preview", { link });
    expect(result).toEqual({ status: 400, body: { error } });
  });

  it("deeplink que não é de tarefa compartilhada é 400", async () => {
    const result = await call(makeDeps(), "share.preview", {
      link: "deskclock://navigate/history",
    });
    expect(result.status).toBe(400);
    expect((result.body as { error: string }).error).toContain("deskclock://task/share");
  });
});

describe("share.apply", () => {
  it("plan: grava specific_date na data pedida e avisa as planejadas", async () => {
    const deps = makeDeps();
    deps.customFieldRepo.findAll.mockResolvedValue([FIELD]);
    const result = await call(deps, "share.apply", {
      link: LINK,
      mode: "plan",
      date: "2026-09-20",
    });
    expect(result.status).toBe(201);
    const saved = deps.plannedTaskRepo.save.mock.calls[0][0];
    expect(saved).toMatchObject({
      workspaceId: WS_ATIVO,
      name: "Revisar PR",
      projectId: "proj-ativo",
      categoryId: null,
      billable: false,
      scheduleType: "specific_date",
      scheduleDate: "2026-09-20",
      recurringDays: null,
      actions: [],
      startTime: "09:00",
      endTime: "10:00",
      customValues: { "cf-etapa": "Dev" },
    });
    expect(deps.notifyPlannedTasksChanged).toHaveBeenCalledOnce();
    expect(result.body).toMatchObject({
      mode: "plan",
      unresolved: { categories: ["Inexistente"] },
    });
  });

  it("plan sem data usa hoje; data fora do formato é 400", async () => {
    const deps = makeDeps();
    await call(deps, "share.apply", { link: LINK, mode: "plan" });
    expect(deps.plannedTaskRepo.save.mock.calls[0][0].scheduleDate).toBe(TODAY);
    expect(
      (await call(deps, "share.apply", { link: LINK, mode: "plan", date: "20/09" })).status
    ).toBe(400);
  });

  it("start: troca a tarefa pelas regras de parada, com o que o link resolveu", async () => {
    const switchToTask = vi.fn(async () => makeTask({ id: "t-novo", name: "Revisar PR" }));
    const deps = makeDeps({ running: { runningTask: makeTask(), switchToTask } });
    const result = await call(deps, "share.apply", { link: LINK, mode: "start" });
    expect(result.status).toBe(201);
    expect(switchToTask).toHaveBeenCalledWith(
      {
        workspaceId: WS_ATIVO,
        name: "Revisar PR",
        projectId: "proj-ativo",
        categoryId: null,
        billable: false,
        customValues: {},
      },
      { syncInBackground: true }
    );
    expect(deps.plannedTaskRepo.save).not.toHaveBeenCalled();
  });

  it("mode ausente, ou date no start, é 400", async () => {
    const deps = makeDeps();
    expect((await call(deps, "share.apply", { link: LINK })).status).toBe(400);
    expect(
      (await call(deps, "share.apply", { link: LINK, mode: "start", date: TODAY })).status
    ).toBe(400);
  });
});
