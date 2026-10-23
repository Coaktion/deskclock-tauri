import { describe, it, expect, vi } from "vitest";
import type { CustomField } from "@domain/entities/CustomField";
import type { MondayItem } from "@shared/types/monday";
import type { MondayProjectMapping } from "@shared/types/mondayConfig";
import type { MondayImportSource } from "@presentation/integrations/importSources";
import { dispatchLocalApiRequest } from "@presentation/localApi/dispatch";
import { makeDeps, WS_ATIVO } from "../fakeDeps";

const MAPPING = {
  deskclockProjectId: "proj-ativo",
  portfolioItemId: "pf-1",
  scope: "cliente",
  mondayBoardId: "b1",
  mondayBoardName: "Cliente",
  activitiesGroupId: "g_act",
  columnIds: {
    reportedHours: "n",
    billingType: "b",
    activityType: "col_activity",
    projectStage: "col_stage",
    status: "s",
    person: "col_person",
  },
  activityTypeLabels: [],
  projectStageLabels: [],
  projectStageTitle: "Project Stage",
  nonBillableReasonLabels: [],
  reportTypeGroupIds: { Activity: "g_act" },
  timelineColumnId: "col_tl",
} as MondayProjectMapping;

const STAGE: CustomField = {
  id: "f-stage",
  label: "Project Stage",
  type: "select",
  options: [
    { id: "o-uat", label: "UAT" },
    { id: "o-dev", label: "Build" },
  ],
  sortOrder: 0,
  archived: false,
  createdAt: "2026-07-01T00:00:00Z",
};

function item(id: string, from: string | null, activity = "Reuniões"): MondayItem {
  return {
    id,
    name: `Item ${id}`,
    url: `https://monday.com/i/${id}`,
    boardId: "b1",
    groupId: "g_tl",
    groupTitle: "Timeline",
    createdAt: "2026-09-01T10:00:00Z",
    columnValues: [
      ...(from
        ? [{ id: "col_tl", type: "timeline", text: "", value: JSON.stringify({ from, to: from }) }]
        : []),
      { id: "col_activity", type: "status", text: activity, value: null },
      { id: "col_stage", type: "status", text: "UAT", value: null },
    ],
  };
}

const ITEMS = [item("i1", "2026-09-16"), item("i2", null), item("i3", "2026-10-10")];

function setup(source: Partial<MondayImportSource> = {}) {
  const deps = makeDeps();
  deps.customFieldRepo.findAll.mockResolvedValue([STAGE]);
  const api = {
    listItems: vi.fn(async (_boards: string[], _options?: unknown) => ITEMS),
    listBoardSchemas: vi.fn(async () => []),
  };
  const full = {
    notConfiguredMessage: null,
    api,
    workspaceId: WS_ATIVO,
    personId: "u1",
    mappings: [MAPPING],
    stageFieldId: "f-stage",
    projectsBlocker: null,
    importProjects: vi.fn(async () => ({
      mappings: [MAPPING, { ...MAPPING, mondayBoardId: "" }],
      skipped: [],
      ignored: 2,
      seeded: { seeded: 3, projects: 1 },
    })),
    categoriesBlocker: null,
    importCategories: vi.fn(async () => ({ created: ["QA"], existing: ["Reuniões"] })),
    catalogsBlocker: null,
    readCatalogs: vi.fn(async () => ({
      activityType: ["QA"],
      projectStage: [],
      nonBillableReason: [],
      reportType: [],
    })),
    ...source,
  };
  deps.imports.monday.mockReturnValue(full);
  return { deps, api, source: full };
}

describe("monday.importPreview", () => {
  it("lista os itens da janela com a sugestão e marca o já importado", async () => {
    const { deps, api } = setup();
    deps.mondayImportedItemRepo.listForWorkspace.mockResolvedValue([
      {
        mondayItemId: "i2",
        workspaceId: WS_ATIVO,
        boardId: "b1",
        plannedTaskId: "p-1",
        snapshot: { name: "", period: null, activityTypeLabel: "", projectStageLabel: "" },
        importedAt: "",
        updatedAt: "",
      },
    ]);
    deps.plannedTaskRepo.findById.mockResolvedValue({ id: "p-1" } as never);

    const res = await dispatchLocalApiRequest(deps, "monday.importPreview", {});

    expect(res.status).toBe(200);
    expect(api.listItems.mock.calls[0][1]).toMatchObject({ excludeGroupIds: ["g_act"] });
    const body = res.body as { period: string; items: Record<string, unknown>[] };
    expect(body.period).toBe("week");
    // i3 (10/10) fica fora da semana; i2 sem cronograma entra.
    expect(body.items.map((i) => i.id)).toEqual(["i1", "i2"]);
    expect(body.items[0]).toMatchObject({
      projectId: "proj-ativo",
      period: { start: "2026-09-16", end: "2026-09-16" },
      categoryId: "cat-ativo",
      billable: false,
      customValues: { "f-stage": "o-uat" },
      alreadyImported: false,
    });
    expect(body.items[1]).toMatchObject({ alreadyImported: true });
  });

  it("next30 alarga; período fora das opções 400", async () => {
    const { deps } = setup();
    const res = await dispatchLocalApiRequest(deps, "monday.importPreview", { period: "next30" });
    expect((res.body as { items: unknown[] }).items).toHaveLength(3);
    expect(
      (await dispatchLocalApiRequest(deps, "monday.importPreview", { period: "all" })).status
    ).toBe(400);
  });

  it("não configurado, sem board, board de outro workspace e sem usuário são 409", async () => {
    const cases: [Partial<MondayImportSource>, string][] = [
      [{ notConfiguredMessage: "Monday não configurado." }, "Monday não configurado."],
      [{ mappings: [] }, "Nenhum board vinculado"],
      [{ mappings: [{ ...MAPPING, deskclockProjectId: "p-outro" }] }, "outro workspace"],
      [{ personId: "" }, "falta o usuário"],
    ];
    for (const [source, message] of cases) {
      const { deps } = setup(source);
      const res = await dispatchLocalApiRequest(deps, "monday.importPreview", {});
      expect(res.status).toBe(409);
      expect((res.body as { error: string }).error).toContain(message);
    }
  });
});

describe("monday.import", () => {
  it("cria com a sugestão ou o que a linha mudou, grava o vínculo e avisa", async () => {
    const { deps } = setup();
    deps.categoryRepo.findAll.mockResolvedValue([
      { id: "cat-ativo", workspaceId: WS_ATIVO, name: "Reuniões", defaultBillable: false },
      { id: "cat-dev", workspaceId: WS_ATIVO, name: "Dev", defaultBillable: true },
    ]);

    const res = await dispatchLocalApiRequest(deps, "monday.import", {
      body: {
        items: [{ id: "i1" }, { id: "i3", categoryId: "cat-dev", projectStage: "Build" }],
      },
    });

    expect(res.status).toBe(200);
    const created = (
      res.body as { created: { itemId: string; plannedTask: Record<string, unknown> }[] }
    ).created;
    expect(created.map((c) => c.itemId)).toEqual(["i1", "i3"]);
    expect(created[0].plannedTask).toMatchObject({
      categoryId: "cat-ativo",
      billable: false,
      customValues: { "f-stage": "o-uat" },
    });
    // A categoria escolhida arrasta o billable dela.
    expect(created[1].plannedTask).toMatchObject({
      categoryId: "cat-dev",
      billable: true,
      customValues: { "f-stage": "o-dev" },
    });
    expect(deps.mondayImportedItemRepo.upsert).toHaveBeenCalledTimes(2);
    expect(deps.notifyPlannedTasksChanged).toHaveBeenCalled();
  });

  it("já importado 409; desconhecido 404; etapa fora das opções 400", async () => {
    const { deps } = setup();
    deps.mondayImportedItemRepo.listForWorkspace.mockResolvedValue([
      {
        mondayItemId: "i1",
        workspaceId: WS_ATIVO,
        boardId: "b1",
        plannedTaskId: "p-1",
        snapshot: { name: "", period: null, activityTypeLabel: "", projectStageLabel: "" },
        importedAt: "",
        updatedAt: "",
      },
    ]);
    deps.plannedTaskRepo.findById.mockResolvedValue({ id: "p-1" } as never);
    const call = (items: unknown) =>
      dispatchLocalApiRequest(deps, "monday.import", { body: { items } });
    expect((await call([{ id: "i1" }])).status).toBe(409);
    expect((await call([{ id: "nao" }])).status).toBe(404);
    expect((await call([{ id: "i2", projectStage: "Inexistente" }])).status).toBe(400);
    expect(deps.plannedTaskRepo.save).not.toHaveBeenCalled();
  });
});

describe("monday.importProjects · importCategories · readCatalogs", () => {
  it("rodam o botão da tela e resumem o resultado", async () => {
    const { deps, source } = setup();
    expect(await dispatchLocalApiRequest(deps, "monday.importProjects", {})).toEqual({
      status: 200,
      body: {
        workspaceId: WS_ATIVO,
        projects: 2,
        withoutBoard: 1,
        skipped: [],
        ignored: 2,
        seededCategories: { seeded: 3, projects: 1 },
      },
    });
    expect(source.importProjects).toHaveBeenCalled();
    expect((await dispatchLocalApiRequest(deps, "monday.importCategories", {})).body).toEqual({
      workspaceId: WS_ATIVO,
      created: ["QA"],
      existing: ["Reuniões"],
    });
    expect((await dispatchLocalApiRequest(deps, "monday.readCatalogs", {})).body).toMatchObject({
      activityType: ["QA"],
    });
  });

  it("o que desabilitaria o botão é 409, sem rodar", async () => {
    const { deps, source } = setup({
      projectsBlocker: "Informe o id do board de Portfólio em Integrações.",
      categoriesBlocker: "Leia os catálogos ou importe os projetos.",
      catalogsBlocker: "Informe o id do board de Report de Horas em Integrações.",
    });
    for (const op of ["monday.importProjects", "monday.importCategories", "monday.readCatalogs"]) {
      expect((await dispatchLocalApiRequest(deps, op, {})).status).toBe(409);
    }
    expect(source.importProjects).not.toHaveBeenCalled();
    expect(source.importCategories).not.toHaveBeenCalled();
    expect(source.readCatalogs).not.toHaveBeenCalled();
  });
});
