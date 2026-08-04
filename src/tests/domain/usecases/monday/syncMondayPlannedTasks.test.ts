import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Category } from "@domain/entities/Category";
import type { CustomField } from "@domain/entities/CustomField";
import type { PlannedTask } from "@domain/entities/PlannedTask";
import type { Project } from "@domain/entities/Project";
import type { IMondayApi } from "@domain/integrations/IMondayApi";
import type { ITrackedMondayItemRepository } from "@domain/integrations/ITrackedMondayItemRepository";
import type { TrackedMondayItem } from "@domain/integrations/TrackedMondayItem";
import type { IPlannedTaskRepository } from "@domain/repositories/IPlannedTaskRepository";
import { syncMondayPlannedTasks } from "@domain/usecases/monday/syncMondayPlannedTasks";
import type { MondayBoardSchema, MondayItem } from "@shared/types/monday";
import type { MondayProjectMapping } from "@shared/types/mondayConfig";

const WORKSPACE_ID = "ws-1";
const NOW_ISO = "2026-08-03T12:00:00.000Z";
const WINDOW = { start: "2026-08-03", end: "2026-08-09" };

const PROJECT: Project = { id: "p1", workspaceId: WORKSPACE_ID, name: "Cliente A" };
const CATEGORIES: Category[] = [
  { id: "c1", workspaceId: WORKSPACE_ID, name: "Development", defaultBillable: true },
  { id: "c2", workspaceId: WORKSPACE_ID, name: "Reuniões", defaultBillable: false },
];
const STAGE_FIELD: CustomField = {
  id: "f-stage",
  label: "Project Stage",
  type: "select",
  options: [{ id: "opt-uat", label: "UAT" }],
  sortOrder: 0,
  archived: false,
  createdAt: "2026-07-01T00:00:00Z",
};

const MAPPING: MondayProjectMapping = {
  deskclockProjectId: "p1",
  mondayBoardId: "b1",
  mondayBoardName: "Cliente A",
  activitiesGroupId: "group_act",
  columnIds: {
    reportedHours: "numbers",
    billingType: "billing",
    activityType: "col_activity",
    projectStage: "col_stage",
    status: "status",
    person: "col_person",
  },
  activityTypeLabels: [],
  projectStageLabels: [],
  projectStageTitle: "Project Stage",
  workspaceId: "monday-ws",
};

const SCHEMA: MondayBoardSchema = {
  id: "b1",
  name: "Cliente A",
  groups: [],
  columns: [{ id: "col_timeline", title: "Timeline", type: "timeline" }],
  views: [],
};

function item(overrides: Partial<MondayItem> = {}, timeline?: { from: string; to?: string }) {
  return {
    id: "i1",
    name: "Desenvolvimento",
    url: "https://monday.com/i/1",
    boardId: "b1",
    groupId: "group_timeline",
    groupTitle: "Timeline",
    createdAt: "2026-08-01T10:00:00Z",
    columnValues: [
      ...(timeline
        ? [
            {
              id: "col_timeline",
              type: "timeline",
              text: "",
              value: JSON.stringify({ from: timeline.from, to: timeline.to ?? timeline.from }),
            },
          ]
        : []),
      { id: "col_activity", type: "status", text: "Development", value: null },
      { id: "col_stage", type: "status", text: "UAT", value: null },
    ],
    ...overrides,
  } satisfies MondayItem;
}

function plannedTask(overrides: Partial<PlannedTask> = {}): PlannedTask {
  return {
    id: "pt-1",
    workspaceId: WORKSPACE_ID,
    name: "Desenvolvimento",
    projectId: "p1",
    categoryId: "c1",
    billable: true,
    scheduleType: "specific_date",
    scheduleDate: "2026-08-03",
    recurringDays: null,
    periodStart: null,
    periodEnd: null,
    completedDates: [],
    actions: [],
    sortOrder: 0,
    createdAt: "2026-08-01T10:00:00Z",
    customValues: {},
    ...overrides,
  };
}

function tracked(overrides: Partial<TrackedMondayItem> = {}): TrackedMondayItem {
  return {
    mondayItemId: "i1",
    workspaceId: WORKSPACE_ID,
    boardId: "b1",
    plannedTaskId: "pt-1",
    snapshot: {
      name: "Desenvolvimento",
      period: { startDayISO: "2026-08-03", endDayISO: "2026-08-03" },
      activityTypeLabel: "Development",
      projectStageLabel: "UAT",
    },
    importedAt: "2026-08-01T10:00:00Z",
    updatedAt: "2026-08-01T10:00:00Z",
    ...overrides,
  };
}

function makeCtx(items: MondayItem[], trackedItems: TrackedMondayItem[] = []) {
  const saved: PlannedTask[] = [];
  const tasks = new Map<string, PlannedTask>();

  const plannedRepo = {
    save: vi.fn(async (t: PlannedTask) => {
      saved.push(t);
      tasks.set(t.id, t);
    }),
    update: vi.fn(async (t: PlannedTask) => {
      tasks.set(t.id, t);
    }),
    findById: vi.fn(async (id: string) => tasks.get(id) ?? null),
    findForDate: vi.fn(),
    findForWeek: vi.fn(),
    complete: vi.fn(),
    uncomplete: vi.fn(),
    reorder: vi.fn(),
    delete: vi.fn(async (id: string) => {
      tasks.delete(id);
    }),
  } as unknown as IPlannedTaskRepository;

  const records = new Map(trackedItems.map((t) => [t.mondayItemId, t]));
  const trackedRepo = {
    listForWorkspace: vi.fn(async () => [...records.values()]),
    upsert: vi.fn(async (t: TrackedMondayItem) => {
      records.set(t.mondayItemId, t);
    }),
    remove: vi.fn(async (id: string) => {
      records.delete(id);
    }),
  } as unknown as ITrackedMondayItemRepository;

  const api = {
    listBoardSchemas: vi.fn(async () => [SCHEMA]),
    listItems: vi.fn(async () => items),
  } as unknown as IMondayApi;

  return { api, plannedRepo, trackedRepo, saved, tasks, records };
}

function run(ctx: ReturnType<typeof makeCtx>, mappings: MondayProjectMapping[] = [MAPPING]) {
  return syncMondayPlannedTasks(
    { api: ctx.api, trackedRepo: ctx.trackedRepo, plannedRepo: ctx.plannedRepo },
    {
      mappings,
      projects: [PROJECT],
      categories: CATEGORIES,
      stageField: STAGE_FIELD,
      personId: "user-1",
      workspaceId: WORKSPACE_ID,
      window: WINDOW,
      nowISO: NOW_ISO,
    }
  );
}

describe("syncMondayPlannedTasks", () => {
  let ctx: ReturnType<typeof makeCtx>;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("cria a planejada do item novo, com categoria, billable e etapa do próprio item", async () => {
    ctx = makeCtx([item({}, { from: "2026-08-05" })]);

    const result = await run(ctx);

    expect(result).toEqual({ created: 1, updated: 0, removed: 0 });
    expect(ctx.saved[0]).toMatchObject({
      name: "Desenvolvimento",
      projectId: "p1",
      categoryId: "c1",
      billable: true,
      scheduleType: "specific_date",
      scheduleDate: "2026-08-05",
      customValues: { "f-stage": "opt-uat" },
    });
    // O vínculo é gravado com o id da planejada criada — é ele que dedupe.
    expect(ctx.records.get("i1")).toMatchObject({ plannedTaskId: ctx.saved[0].id, boardId: "b1" });
  });

  it("não cria o que está fora da janela", async () => {
    ctx = makeCtx([item({}, { from: "2026-09-15" })]);

    expect(await run(ctx)).toEqual({ created: 0, updated: 0, removed: 0 });
    expect(ctx.plannedRepo.save).not.toHaveBeenCalled();
  });

  it("item sem cronograma entra mesmo assim, no dia corrente", async () => {
    // Ele nasce no dia de hoje; escondê-lo por falta de data seria escondê-lo
    // para sempre.
    ctx = makeCtx([item()]);

    expect((await run(ctx)).created).toBe(1);
    expect(ctx.saved[0]).toMatchObject({
      scheduleType: "specific_date",
      scheduleDate: "2026-08-03",
    });
  });

  it("item já rastreado e intocado não vira tarefa de novo", async () => {
    ctx = makeCtx([item({}, { from: "2026-08-03" })], [tracked()]);
    ctx.tasks.set("pt-1", plannedTask());

    expect(await run(ctx)).toEqual({ created: 0, updated: 0, removed: 0 });
    expect(ctx.plannedRepo.save).not.toHaveBeenCalled();
    expect(ctx.plannedRepo.update).not.toHaveBeenCalled();
  });

  it("reflete o que mudou no Monday e preserva a edição local do resto", async () => {
    ctx = makeCtx(
      [item({ name: "Desenvolvimento — fase 2" }, { from: "2026-08-03" })],
      [tracked()]
    );
    // O usuário trocou a categoria aqui; o Monday só renomeou.
    ctx.tasks.set("pt-1", plannedTask({ categoryId: "c2", billable: false }));

    expect(await run(ctx)).toEqual({ created: 0, updated: 1, removed: 0 });
    expect(ctx.tasks.get("pt-1")).toMatchObject({
      name: "Desenvolvimento — fase 2",
      categoryId: "c2",
      billable: false,
    });
    expect(ctx.records.get("i1")?.snapshot.name).toBe("Desenvolvimento — fase 2");
  });

  it("remarcação da Timeline vira período, mesmo fora da janela de criação", async () => {
    ctx = makeCtx([item({}, { from: "2026-09-01", to: "2026-09-10" })], [tracked()]);
    ctx.tasks.set("pt-1", plannedTask());

    expect((await run(ctx)).updated).toBe(1);
    expect(ctx.tasks.get("pt-1")).toMatchObject({
      scheduleType: "period",
      periodStart: "2026-09-01",
      periodEnd: "2026-09-10",
    });
  });

  it("apaga a planejada do item que sumiu do board e nunca foi concluída", async () => {
    ctx = makeCtx([], [tracked()]);
    ctx.tasks.set("pt-1", plannedTask());

    expect(await run(ctx)).toEqual({ created: 0, updated: 0, removed: 1 });
    expect(ctx.tasks.has("pt-1")).toBe(false);
    expect(ctx.records.has("i1")).toBe(false);
  });

  it("preserva a planejada já concluída, mesmo com o item fora do board", async () => {
    ctx = makeCtx([], [tracked()]);
    ctx.tasks.set("pt-1", plannedTask({ completedDates: ["2026-08-01"] }));

    expect(await run(ctx)).toEqual({ created: 0, updated: 0, removed: 0 });
    expect(ctx.tasks.has("pt-1")).toBe(true);
    expect(ctx.records.has("i1")).toBe(true);
  });

  it("não apaga nada de board que saiu do mapeamento", async () => {
    // A busca deixou de cobrir esse board; os itens continuam vivos no Monday.
    ctx = makeCtx([], [tracked({ boardId: "b-desvinculado" })]);
    ctx.tasks.set("pt-1", plannedTask());

    expect(await run(ctx)).toEqual({ created: 0, updated: 0, removed: 0 });
    expect(ctx.tasks.has("pt-1")).toBe(true);
  });

  it("não recria a planejada que o usuário apagou à mão", async () => {
    ctx = makeCtx([item({ name: "Outro nome" }, { from: "2026-08-03" })], [tracked()]);
    // Sem a planejada no repositório: ela foi excluída no planejamento.

    const result = await run(ctx);

    expect(result).toEqual({ created: 0, updated: 0, removed: 0 });
    expect(ctx.plannedRepo.save).not.toHaveBeenCalled();
    // O snapshot ainda assim avança, para o item não voltar a gerar tarefa.
    expect(ctx.records.get("i1")?.snapshot.name).toBe("Outro nome");
  });

  it("sem boards mapeados ou sem usuário, não toca no Monday", async () => {
    ctx = makeCtx([item()]);

    expect(await run(ctx, [])).toEqual({ created: 0, updated: 0, removed: 0 });
    expect(ctx.api.listBoardSchemas).not.toHaveBeenCalled();
  });
});
