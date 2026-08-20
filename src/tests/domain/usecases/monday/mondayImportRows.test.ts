import { describe, it, expect } from "vitest";
import type { Category } from "@domain/entities/Category";
import type { CustomField } from "@domain/entities/CustomField";
import type { Project } from "@domain/entities/Project";
import {
  buildImportRows,
  importColumnIds,
  resolveItemDefaults,
} from "@domain/usecases/monday/mondayImportRows";
import type { MondayItem } from "@shared/types/monday";
import type { MondayProjectMapping } from "@shared/types/mondayConfig";

const PROJECT: Project = { id: "p1", workspaceId: "ws-1", name: "Cliente A", colorIndex: 0 };

function mapping(overrides: Partial<MondayProjectMapping> = {}): MondayProjectMapping {
  return {
    deskclockProjectId: "p1",
    portfolioItemId: "item-p1",
    scope: "cliente" as const,
    mondayBoardId: "b1",
    mondayBoardName: "Cliente A",
    activitiesGroupId: "group_act",
    columnIds: {
      reportedHours: "numbers",
      billingType: "billing",
      activityType: "col_activity",
      projectStage: "col_stage",
      status: "status",
      person: "person",
    },
    activityTypeLabels: [],
    projectStageLabels: [],
    projectStageTitle: "Project Stage",
    nonBillableReasonLabels: [],
    reportTypeGroupIds: { Activity: "group_act" },
    ...overrides,
  };
}

function item(overrides: Partial<MondayItem> = {}): MondayItem {
  return {
    id: "1",
    name: "Desenvolvimento",
    url: "https://monday.com/i/1",
    boardId: "b1",
    groupId: "group_timeline",
    groupTitle: "Timeline",
    createdAt: "2026-08-01T10:00:00Z",
    columnValues: [],
    ...overrides,
  };
}

const CATEGORIES: Category[] = [
  { id: "c1", workspaceId: "ws-1", name: "Development", defaultBillable: true },
  { id: "c2", workspaceId: "ws-1", name: "Reuniões", defaultBillable: false },
];

const STAGE_FIELD: CustomField = {
  id: "f-stage",
  label: "Project Stage",
  type: "select",
  options: [
    { id: "opt-dev", label: "Development" },
    { id: "opt-uat", label: "UAT" },
  ],
  sortOrder: 0,
  archived: false,
  createdAt: "2026-07-01T00:00:00Z",
};

describe("buildImportRows", () => {
  it("resolve project, período e rótulos de cada item", () => {
    const rows = buildImportRows(
      [
        item({
          columnValues: [
            {
              id: "col_timeline",
              type: "timeline",
              text: "",
              value: '{"from":"2026-08-03","to":"2026-08-07"}',
            },
            { id: "col_activity", type: "status", text: " Development ", value: null },
            { id: "col_stage", type: "status", text: "UAT", value: null },
          ],
        }),
      ],
      [mapping()],
      [PROJECT],
      new Map([["b1", "col_timeline"]])
    );

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      project: PROJECT,
      period: { startDayISO: "2026-08-03", endDayISO: "2026-08-07" },
      activityTypeLabel: "Development",
      projectStageLabel: "UAT",
    });
  });

  it("descarta item de board cujo Project não existe no workspace ativo", () => {
    // A planejada nasceria apontando para um projeto que a tela nem exibe.
    const rows = buildImportRows([item()], [mapping()], [], new Map([["b1", "col_timeline"]]));

    expect(rows).toEqual([]);
  });

  it("item sem coluna de cronograma fica sem período, e não some", () => {
    const rows = buildImportRows([item()], [mapping()], [PROJECT], new Map([["b1", undefined]]));

    expect(rows).toHaveLength(1);
    expect(rows[0].period).toBeNull();
  });
});

describe("importColumnIds", () => {
  it("junta as colunas do mapeamento e a de cronograma, sem repetir nem vazios", () => {
    const ids = importColumnIds(
      [mapping(), mapping({ mondayBoardId: "b2" })],
      new Map([
        ["b1", "col_timeline"],
        ["b2", undefined],
      ])
    );

    expect(ids.sort()).toEqual(["col_activity", "col_stage", "col_timeline"]);
  });
});

describe("resolveItemDefaults", () => {
  it("casa a categoria pelo Activity Type e traz o billable dela (§6.2)", () => {
    const defaults = resolveItemDefaults(
      { activityTypeLabel: "development", projectStageLabel: "" },
      CATEGORIES,
      STAGE_FIELD
    );

    expect(defaults).toMatchObject({
      categoryId: "c1",
      categoryName: "Development",
      billable: true,
    });
  });

  it("casa a etapa pelo rótulo da coluna, ignorando caixa", () => {
    const defaults = resolveItemDefaults(
      { activityTypeLabel: "", projectStageLabel: "uat" },
      CATEGORIES,
      STAGE_FIELD
    );

    expect(defaults.customValues).toEqual({ "f-stage": "opt-uat" });
  });

  it("sem correspondência, deixa os campos vazios e editáveis", () => {
    const defaults = resolveItemDefaults(
      { activityTypeLabel: "Algo que não existe", projectStageLabel: "Nem isso" },
      CATEGORIES,
      STAGE_FIELD
    );

    expect(defaults).toMatchObject({ categoryId: null, categoryName: "", billable: false });
    expect(defaults.customValues).toEqual({});
  });
});
