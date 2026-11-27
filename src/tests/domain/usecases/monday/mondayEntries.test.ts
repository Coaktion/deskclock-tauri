import { describe, it, expect, vi } from "vitest";
import type { IMondayApi } from "@domain/integrations/IMondayApi";
import type { MondayItem } from "@shared/types/monday";
import type { MondayProjectMapping } from "@shared/types/mondayConfig";

const listItemsOwnedBy = vi.fn();
vi.mock("@domain/usecases/monday/listItemsOwnedBy", () => ({
  listItemsOwnedBy: (...args: unknown[]) => listItemsOwnedBy(...args),
}));

const { groupMondayEntriesByDay, loadMondayEntries, mondayEntriesInRange, mondayEntriesWindow } =
  await import("@domain/usecases/monday/mondayEntries");

const MAPPING: MondayProjectMapping = {
  deskclockProjectId: "p-1",
  portfolioItemId: "i-1",
  scope: "cliente",
  mondayBoardId: "b1",
  mondayBoardName: "Board 1",
  activitiesGroupId: "g_act",
  columnIds: {
    reportedHours: "hours",
    billingType: "billing",
    activityType: "activity",
    status: "status",
    person: "person",
    startDate: "start",
    endDate: "end",
  },
  activityTypeLabels: [],
  projectStageLabels: [],
  projectStageTitle: "Project Stage",
  nonBillableReasonLabels: [],
  reportTypeGroupIds: { Activity: "g_act" },
};

function column(id: string, text: string | null, value: string | null = null) {
  return { id, type: "x", text, value };
}

function item(id: string, boardId: string, start: string | null): MondayItem {
  return {
    id,
    name: `Atividade ${id}`,
    url: `https://x.monday.com/boards/${boardId}/pulses/${id}`,
    boardId,
    groupId: "g_act",
    groupTitle: "Activities",
    createdAt: "2026-09-01T12:00:00Z",
    columnValues: [
      column("hours", "1.5"),
      column("billing", "Billable"),
      column("activity", "Development"),
      ...(start
        ? [
            column("start", start, JSON.stringify({ date: start })),
            column("end", start, JSON.stringify({ date: start })),
          ]
        : []),
    ],
  };
}

describe("mondayEntriesWindow", () => {
  it("monta as quatro janelas do modal a partir de hoje", () => {
    expect(mondayEntriesWindow("today", "2026-09-15")).toEqual({
      start: "2026-09-15",
      end: "2026-09-15",
    });
    expect(mondayEntriesWindow("7days", "2026-09-15").start).toBe("2026-09-09");
    expect(mondayEntriesWindow("30days", "2026-09-15").start).toBe("2026-08-17");
    expect(mondayEntriesWindow("month", "2026-09-15")).toEqual({
      start: "2026-09-01",
      end: "2026-09-15",
    });
  });
});

describe("loadMondayEntries", () => {
  it("busca só as atividades do usuário, com piso, e lê as colunas do board", async () => {
    listItemsOwnedBy.mockResolvedValue([
      item("1", "b1", "2026-09-14"),
      item("2", "outro-board", "2026-09-14"),
    ]);
    const api = {} as IMondayApi;
    const entries = await loadMondayEntries(api, [MAPPING], "u-1", "2026-09-15");

    const [, , personId, options] = listItemsOwnedBy.mock.calls[0];
    expect(personId).toBe("u-1");
    expect(options.scope).toBe("activities");
    expect(options.endsOnOrAfterDay < "2026-08-17").toBe(true);
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      itemId: "1",
      boardName: "Board 1",
      hoursDecimal: 1.5,
      billable: true,
      activityTypeLabel: "Development",
      period: { startDayISO: "2026-09-14", endDayISO: "2026-09-14" },
    });
  });
});

describe("mondayEntriesInRange e groupMondayEntriesByDay", () => {
  it("recorta pela janela e agrupa pelo dia de início, do mais recente", async () => {
    listItemsOwnedBy.mockResolvedValue([
      item("1", "b1", "2026-09-14"),
      item("2", "b1", "2026-09-15"),
      item("3", "b1", "2026-08-01"),
      item("4", "b1", null),
    ]);
    const all = await loadMondayEntries({} as IMondayApi, [MAPPING], "u-1", "2026-09-15");
    const inWeek = mondayEntriesInRange(all, { start: "2026-09-09", end: "2026-09-15" });
    expect(inWeek.map((e) => e.itemId).sort()).toEqual(["1", "2"]);
    const groups = groupMondayEntriesByDay(inWeek);
    expect(groups.map((g) => g.dayISO)).toEqual(["2026-09-15", "2026-09-14"]);
    expect(groups[0].totalHours).toBe(1.5);
  });
});
