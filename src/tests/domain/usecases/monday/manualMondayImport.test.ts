import { describe, it, expect, vi } from "vitest";
import type { PlannedTask } from "@domain/entities/PlannedTask";
import type { Project } from "@domain/entities/Project";
import type { IMondayApi } from "@domain/integrations/IMondayApi";
import type { TrackedMondayItem } from "@domain/integrations/TrackedMondayItem";
import type { IPlannedTaskRepository } from "@domain/repositories/IPlannedTaskRepository";
import {
  importMondaySelection,
  loadMondayImportCandidates,
  mondayImportBoards,
  mondayImportWindow,
  rowsInWindow,
} from "@domain/usecases/monday/manualMondayImport";
import type { MondayImportRow } from "@domain/usecases/monday/mondayImportRows";
import type { MondayItem } from "@shared/types/monday";
import type { MondayProjectMapping } from "@shared/types/mondayConfig";
import { localISO } from "../../../helpers/localTime";

const WS = "ws-1";
const PROJECT: Project = { id: "p1", workspaceId: WS, name: "Cliente A", colorIndex: 0 };

function mapping(overrides: Partial<MondayProjectMapping> = {}): MondayProjectMapping {
  return {
    deskclockProjectId: "p1",
    portfolioItemId: "item-p1",
    scope: "cliente",
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
    nonBillableReasonLabels: [],
    reportTypeGroupIds: { Activity: "group_act" },
    // Cache do cronograma: sem leitura de schema no teste.
    timelineColumnId: "col_timeline",
    ...overrides,
  };
}

function item(
  id: string,
  timeline?: { from: string; to: string },
  name = "Desenvolvimento"
): MondayItem {
  return {
    id,
    name,
    url: `https://monday.com/i/${id}`,
    boardId: "b1",
    groupId: "group_timeline",
    groupTitle: "Timeline",
    createdAt: "2026-08-01T10:00:00Z",
    columnValues: [
      ...(timeline
        ? [{ id: "col_timeline", type: "timeline", text: "", value: JSON.stringify(timeline) }]
        : []),
      { id: "col_activity", type: "status", text: "Development", value: null },
    ],
  };
}

describe("mondayImportBoards", () => {
  it("só board com quadro e, dele, só o de projeto do workspace", () => {
    const { mapped, available } = mondayImportBoards(
      [
        mapping(),
        mapping({ deskclockProjectId: "p-outro", mondayBoardId: "b2" }),
        mapping({ deskclockProjectId: "p1", mondayBoardId: "" }),
      ],
      [PROJECT]
    );
    expect(mapped.map((m) => m.mondayBoardId)).toEqual(["b1", "b2"]);
    expect(available.map((m) => m.mondayBoardId)).toEqual(["b1"]);
  });
});

describe("mondayImportWindow e rowsInWindow", () => {
  it("as três janelas olham para a frente; item sem cronograma entra em todas", () => {
    expect(mondayImportWindow("today", "2026-09-16", 1)).toEqual({
      start: "2026-09-16",
      end: "2026-09-16",
    });
    expect(mondayImportWindow("week", "2026-09-16", 1)).toEqual({
      start: "2026-09-14",
      end: "2026-09-20",
    });
    expect(mondayImportWindow("next30", "2026-09-16", 1).end).toBe("2026-10-16");

    const rows = [
      { period: null },
      { period: { startDayISO: "2026-09-15", endDayISO: "2026-09-15" } },
      { period: { startDayISO: "2026-08-01", endDayISO: "2026-08-02" } },
    ] as MondayImportRow[];
    expect(rowsInWindow(rows, { start: "2026-09-14", end: "2026-09-20" })).toEqual(
      rows.slice(0, 2)
    );
  });
});

function deps(items: MondayItem[], tracked: TrackedMondayItem[] = [], alive: string[] = []) {
  const api = {
    listItems: vi.fn(async () => items),
    listBoardSchemas: vi.fn(async () => []),
  } as unknown as IMondayApi & { listItems: ReturnType<typeof vi.fn> };
  const trackedRepo = {
    listForWorkspace: vi.fn(async () => tracked),
    upsert: vi.fn(async () => {}),
    remove: vi.fn(async () => {}),
  };
  const plannedRepo = {
    findForWeek: vi.fn(async () => [{ name: "desenvolvimento " }] as PlannedTask[]),
    findById: vi.fn(async (id: string) => (alive.includes(id) ? ({ id } as PlannedTask) : null)),
    save: vi.fn(async () => {}),
  } as unknown as IPlannedTaskRepository & { findForWeek: ReturnType<typeof vi.fn> };
  return { api, trackedRepo, plannedRepo };
}

describe("loadMondayImportCandidates", () => {
  it("busca os itens do usuário fora de Activities e marca o importado e o homônimo", async () => {
    const d = deps(
      [item("i1", { from: "2026-09-15", to: "2026-09-18" }), item("i2", undefined, "Outro")],
      [
        {
          mondayItemId: "i1",
          workspaceId: WS,
          boardId: "b1",
          plannedTaskId: "pt-1",
          snapshot: { name: "", period: null, activityTypeLabel: "", projectStageLabel: "" },
          importedAt: "",
          updatedAt: "",
        },
      ],
      ["pt-1"]
    );

    const result = await loadMondayImportCandidates(d, {
      boards: [mapping()],
      projects: [PROJECT],
      personId: "u1",
      workspaceId: WS,
      todayISO: "2026-09-16",
    });

    expect(d.api.listItems.mock.calls[0][1]).toMatchObject({
      owner: { columnId: "col_person", personId: "u1" },
      excludeGroupIds: ["group_act"],
    });
    expect(d.plannedRepo.findForWeek).toHaveBeenCalledWith("2026-09-15", "2026-09-18", WS);
    expect(result.rows.map((r) => [r.item.id, r.project.id])).toEqual([
      ["i1", "p1"],
      ["i2", "p1"],
    ]);
    expect([...result.imported]).toEqual(["i1"]);
    expect(result.existingNames.has("desenvolvimento")).toBe(true);
  });
});

describe("importMondaySelection", () => {
  it("cria a planejada e grava o vínculo com o snapshot do item", async () => {
    const d = deps([]);
    const row: MondayImportRow = {
      item: item("i1"),
      project: PROJECT,
      period: { startDayISO: "2026-09-17", endDayISO: "2026-09-17" },
      activityTypeLabel: "Development",
      projectStageLabel: "UAT",
    };
    const nowISO = localISO(2026, 9, 16, 10);

    const planned = await importMondaySelection(
      d,
      [{ row, categoryId: "c1", billable: true, customValues: { f: "o" } }],
      { nowISO, workspaceId: WS, addOpenUrlAction: true }
    );

    expect(planned[0]).toMatchObject({
      workspaceId: WS,
      name: "Desenvolvimento",
      projectId: "p1",
      categoryId: "c1",
      billable: true,
      scheduleType: "specific_date",
      scheduleDate: "2026-09-17",
      customValues: { f: "o" },
    });
    expect(planned[0].actions).toHaveLength(1);
    expect(d.trackedRepo.upsert).toHaveBeenCalledWith({
      mondayItemId: "i1",
      workspaceId: WS,
      boardId: "b1",
      plannedTaskId: planned[0].id,
      snapshot: {
        name: "Desenvolvimento",
        period: row.period,
        activityTypeLabel: "Development",
        projectStageLabel: "UAT",
      },
      importedAt: nowISO,
      updatedAt: nowISO,
    });
  });
});
