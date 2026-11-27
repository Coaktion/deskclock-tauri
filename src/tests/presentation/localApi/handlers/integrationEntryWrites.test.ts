import { describe, it, expect, vi } from "vitest";
import type { MondayEntry } from "@domain/usecases/monday/mondayEntries";
import {
  CLOCKIFY_ENTRY_DESCRIPTION_REQUIRED,
  CLOCKIFY_ENTRY_PROJECT_REQUIRED,
} from "@domain/usecases/clockify/clockifyEntryPayload";
import { MONDAY_ENTRY_NAME_REQUIRED } from "@domain/usecases/monday/mondayEntryWrite";
import type { MondayProjectMapping } from "@shared/types/mondayConfig";
import { localISO } from "../../../helpers/localTime";

const loadMondayEntries = vi.fn();
vi.mock("@domain/usecases/monday/mondayEntries", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@domain/usecases/monday/mondayEntries")>()),
  loadMondayEntries: (...args: unknown[]) => loadMondayEntries(...args),
}));

const { dispatchLocalApiRequest } = await import("@presentation/localApi/dispatch");
const { makeDeps, TODAY } = await import("../fakeDeps");

function clockifySetup(notConfiguredMessage: string | null = null) {
  const deps = makeDeps();
  const api = {
    listProjects: vi.fn(async () => [
      { id: "cp", name: "Site", clientName: "ACME" },
      { id: "ci", name: "Interno", clientName: null },
    ]),
    listTags: vi.fn(async () => [
      { id: "t1", name: "Dev" },
      { id: "t2", name: "Suporte" },
    ]),
    createTimeEntry: vi.fn(async (_ws: string, _payload: Record<string, unknown>) => ({
      id: "novo",
    })),
    updateTimeEntry: vi.fn(async () => ({})),
    deleteTimeEntry: vi.fn(async () => {}),
  };
  deps.entries.clockify.mockReturnValue({
    notConfiguredMessage,
    api,
    workspaceId: "cw",
    workspaceName: "Empresa",
    userId: "cu",
    defaultTagIds: ["t1"],
  });
  return { deps, api };
}

const BODY = {
  description: "  Revisão  ",
  projectName: "ACME - Site",
  date: "2026-09-15",
  start: "09:00",
  end: "10:30",
};

describe("clockify.createEntry", () => {
  it("cria com o payload do formulário: tags padrão e não faturável quando ausentes", async () => {
    const { deps, api } = clockifySetup();
    const res = await dispatchLocalApiRequest(deps, "clockify.createEntry", { body: BODY });
    expect(res.status).toBe(201);
    expect(api.createTimeEntry).toHaveBeenCalledWith("cw", {
      start: localISO(2026, 9, 15, 9),
      end: localISO(2026, 9, 15, 10, 30),
      description: "Revisão",
      billable: false,
      projectId: "cp",
      tagIds: ["t1"],
    });
    expect(res.body).toEqual({
      id: "novo",
      description: "Revisão",
      start: localISO(2026, 9, 15, 9),
      end: localISO(2026, 9, 15, 10, 30),
      durationSeconds: 5400,
      billable: false,
      projectId: "cp",
      tagIds: ["t1"],
    });
  });

  it("tags por nome, lista vazia sem tags, fim antes do início no dia seguinte", async () => {
    const { deps, api } = clockifySetup();
    await dispatchLocalApiRequest(deps, "clockify.createEntry", {
      body: { ...BODY, projectId: "ci", tagNames: ["Suporte"], start: "23:00", end: "01:00" },
    });
    const payload = api.createTimeEntry.mock.calls[0][1];
    expect(payload.projectId).toBe("ci");
    expect(payload.tagIds).toEqual(["t2"]);
    expect(payload.end).toBe(localISO(2026, 9, 16, 1));

    const empty = clockifySetup();
    await dispatchLocalApiRequest(empty.deps, "clockify.createEntry", {
      body: { ...BODY, tagIds: [] },
    });
    expect("tagIds" in empty.api.createTimeEntry.mock.calls[0][1]).toBe(false);
  });

  it("validação do formulário é 400 com a regra da tela, sem chamar o Clockify", async () => {
    const { deps, api } = clockifySetup();
    const blank = await dispatchLocalApiRequest(deps, "clockify.createEntry", {
      body: { ...BODY, description: "  " },
    });
    expect(blank).toEqual({ status: 400, body: { error: CLOCKIFY_ENTRY_DESCRIPTION_REQUIRED } });
    const noProject = await dispatchLocalApiRequest(deps, "clockify.createEntry", {
      body: { ...BODY, projectName: undefined },
    });
    expect(noProject).toEqual({ status: 400, body: { error: CLOCKIFY_ENTRY_PROJECT_REQUIRED } });
    for (const body of [
      { ...BODY, start: "9h" },
      { ...BODY, date: "15/09/2026" },
      { ...BODY, tagIds: "t1" },
    ]) {
      expect((await dispatchLocalApiRequest(deps, "clockify.createEntry", { body })).status).toBe(
        400
      );
    }
    expect(api.createTimeEntry).not.toHaveBeenCalled();
  });

  it("projeto ou tag que não existe no Clockify é 409", async () => {
    const { deps, api } = clockifySetup();
    for (const body of [
      { ...BODY, projectName: "Site" },
      { ...BODY, projectName: undefined, projectId: "x" },
      { ...BODY, tagNames: ["Nenhuma"] },
    ]) {
      expect((await dispatchLocalApiRequest(deps, "clockify.createEntry", { body })).status).toBe(
        409
      );
    }
    expect(api.createTimeEntry).not.toHaveBeenCalled();
  });

  it("não configurado é 409 com o aviso, sem chamar o Clockify", async () => {
    const { deps, api } = clockifySetup("Configure o Clockify.");
    const res = await dispatchLocalApiRequest(deps, "clockify.createEntry", { body: BODY });
    expect(res).toEqual({ status: 409, body: { error: "Configure o Clockify." } });
    expect(api.listProjects).not.toHaveBeenCalled();
  });

  it("erro do Clockify segue o tratamento da leitura", async () => {
    const { deps, api } = clockifySetup();
    api.createTimeEntry.mockRejectedValueOnce(new Error("Clockify recusou"));
    const res = await dispatchLocalApiRequest(deps, "clockify.createEntry", { body: BODY });
    expect(res).toEqual({ status: 500, body: { error: "Erro interno: Clockify recusou" } });
  });
});

describe("clockify.updateEntry / clockify.deleteEntry", () => {
  it("edita regravando o apontamento inteiro: billable e tags obrigatórios", async () => {
    const { deps, api } = clockifySetup();
    const missing = await dispatchLocalApiRequest(deps, "clockify.updateEntry", {
      id: "e1",
      body: BODY,
    });
    expect(missing.status).toBe(400);
    const noTags = await dispatchLocalApiRequest(deps, "clockify.updateEntry", {
      id: "e1",
      body: { ...BODY, billable: true },
    });
    expect(noTags.status).toBe(400);
    expect(api.updateTimeEntry).not.toHaveBeenCalled();

    const res = await dispatchLocalApiRequest(deps, "clockify.updateEntry", {
      id: "e1",
      body: { ...BODY, billable: true, tagIds: [] },
    });
    expect(res.status).toBe(200);
    expect(api.updateTimeEntry).toHaveBeenCalledWith("cw", "e1", {
      start: localISO(2026, 9, 15, 9),
      end: localISO(2026, 9, 15, 10, 30),
      description: "Revisão",
      billable: true,
      projectId: "cp",
    });
    expect((res.body as { id: string; tagIds: string[] }).tagIds).toEqual([]);
  });

  it("exclui no workspace do Clockify e responde 204", async () => {
    const { deps, api } = clockifySetup();
    const res = await dispatchLocalApiRequest(deps, "clockify.deleteEntry", { id: "e1" });
    expect(res).toEqual({ status: 204, body: null });
    expect(api.deleteTimeEntry).toHaveBeenCalledWith("cw", "e1");
  });

  it("não configurado é 409", async () => {
    const { deps, api } = clockifySetup("Configure o Clockify.");
    expect((await dispatchLocalApiRequest(deps, "clockify.deleteEntry", { id: "e1" })).status).toBe(
      409
    );
    expect(api.deleteTimeEntry).not.toHaveBeenCalled();
  });
});

const MAPPING = {
  mondayBoardId: "b1",
  mondayBoardName: "Board 1",
  columnIds: {
    reportedHours: "hours",
    billingType: "billing",
    activityType: "activity",
    status: "status",
    person: "person",
  },
  activityTypeLabels: ["Development", "Meeting"],
  projectStageLabels: [],
  statusLabels: ["Done"],
} as unknown as MondayProjectMapping;

function mondayEntry(itemId: string, mapping: MondayProjectMapping = MAPPING): MondayEntry {
  return {
    boardId: "b1",
    boardName: "Board 1",
    itemId,
    name: `Atividade ${itemId}`,
    url: `https://x.monday.com/${itemId}`,
    hoursDecimal: 1.5,
    billable: true,
    activityTypeLabel: "Development",
    projectStageLabel: "",
    statusLabel: "Done",
    period: { startDayISO: TODAY, endDayISO: TODAY },
    mapping,
  };
}

function mondaySetup(notConfiguredMessage: string | null = null, mapping = MAPPING) {
  const deps = makeDeps();
  const api = {
    changeColumnValues: vi.fn(
      async (_board: string, _item: string, _values: Record<string, unknown>) => ({ id: "1" })
    ),
    deleteItem: vi.fn(async () => {}),
  };
  deps.entries.monday.mockReturnValue({
    notConfiguredMessage,
    api,
    userId: "7",
    mappings: [mapping],
  });
  loadMondayEntries.mockReset();
  loadMondayEntries.mockResolvedValue([mondayEntry("1", mapping)]);
  return { deps, api };
}

describe("monday.updateEntry", () => {
  it("ausente mantém o atual; grava pela guarda dos rótulos e devolve como ficou", async () => {
    const { deps, api } = mondaySetup();
    const res = await dispatchLocalApiRequest(deps, "monday.updateEntry", {
      id: "1",
      body: { hours: 2, billable: false, activityType: "Meeting" },
    });
    expect(res.status).toBe(200);
    expect(loadMondayEntries.mock.calls[0][2]).toBe("7");
    expect(loadMondayEntries.mock.calls[0][3]).toBe(TODAY);
    expect(api.changeColumnValues).toHaveBeenCalledWith("b1", "1", {
      name: "Atividade 1",
      hours: "2",
      person: { personsAndTeams: [{ id: 7, kind: "person" }] },
      billing: { label: "Non Billable" },
      status: { label: "Done" },
      activity: { label: "Meeting" },
    });
    expect(res.body).toMatchObject({
      itemId: "1",
      hours: 2,
      billable: false,
      activityType: "Meeting",
      projectStage: null,
    });
  });

  it("null no Activity Type é a opção vazia: a coluna não é escrita", async () => {
    const { deps, api } = mondaySetup();
    await dispatchLocalApiRequest(deps, "monday.updateEntry", {
      id: "1",
      body: { activityType: null },
    });
    const values = api.changeColumnValues.mock.calls[0][2];
    expect("activity" in values).toBe(false);
  });

  it("o que a tela não deixa escolher é 400, sem gravar", async () => {
    const { deps, api } = mondaySetup();
    for (const body of [
      { name: "  " },
      { hours: -1 },
      { hours: "2" },
      { activityType: "Inexistente" },
      { projectStage: "Discovery" },
    ]) {
      const res = await dispatchLocalApiRequest(deps, "monday.updateEntry", { id: "1", body });
      expect(res.status, JSON.stringify(body)).toBe(400);
    }
    const blank = await dispatchLocalApiRequest(deps, "monday.updateEntry", {
      id: "1",
      body: { name: " " },
    });
    expect(blank.body).toEqual({ error: MONDAY_ENTRY_NAME_REQUIRED });
    const noBilling = mondaySetup(null, {
      ...MAPPING,
      columnIds: { ...MAPPING.columnIds, billingType: undefined },
    } as MondayProjectMapping);
    const res = await dispatchLocalApiRequest(noBilling.deps, "monday.updateEntry", {
      id: "1",
      body: { billable: true },
    });
    expect(res.status).toBe(400);
    expect(api.changeColumnValues).not.toHaveBeenCalled();
    expect(noBilling.api.changeColumnValues).not.toHaveBeenCalled();
  });

  it("atividade que não está entre as suas é 404; não configurado é 409", async () => {
    const { deps, api } = mondaySetup();
    expect(
      (await dispatchLocalApiRequest(deps, "monday.updateEntry", { id: "99", body: {} })).status
    ).toBe(404);
    expect(api.changeColumnValues).not.toHaveBeenCalled();
    const off = mondaySetup("Conecte o Monday.");
    expect(
      (await dispatchLocalApiRequest(off.deps, "monday.updateEntry", { id: "1", body: {} })).status
    ).toBe(409);
    expect(loadMondayEntries).not.toHaveBeenCalled();
  });
});

describe("monday.deleteEntry", () => {
  it("exclui no Monday e limpa o rastreio local", async () => {
    const { deps, api } = mondaySetup();
    const res = await dispatchLocalApiRequest(deps, "monday.deleteEntry", { id: "1" });
    expect(res).toEqual({ status: 204, body: null });
    expect(api.deleteItem).toHaveBeenCalledWith("1");
    expect(deps.mondayActivityItemRepo.deleteItem).toHaveBeenCalledWith("b1", "1");
  });

  it("falha do Monday não limpa o rastreio; a desconhecida é 404", async () => {
    const { deps, api } = mondaySetup();
    api.deleteItem.mockRejectedValueOnce(new Error("Monday recusou"));
    const res = await dispatchLocalApiRequest(deps, "monday.deleteEntry", { id: "1" });
    expect(res).toEqual({ status: 500, body: { error: "Erro interno: Monday recusou" } });
    expect(deps.mondayActivityItemRepo.deleteItem).not.toHaveBeenCalled();
    expect((await dispatchLocalApiRequest(deps, "monday.deleteEntry", { id: "99" })).status).toBe(
      404
    );
  });
});
