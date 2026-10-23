import { describe, it, expect, vi } from "vitest";
import type { IMondayApi } from "@domain/integrations/IMondayApi";
import type { MondayEntry } from "@domain/usecases/monday/mondayEntries";
import {
  buildMondayEntryUpdate,
  deleteMondayEntry,
  mondayEntryPatchError,
  updateMondayEntry,
  MONDAY_ENTRY_HOURS_INVALID,
  MONDAY_ENTRY_NAME_REQUIRED,
  type MondayEntryPatch,
} from "@domain/usecases/monday/mondayEntryWrite";
import type { MondayProjectMapping } from "@shared/types/mondayConfig";

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
    projectStage: "stage",
  },
  activityTypeLabels: ["Development", "Meeting"],
  projectStageLabels: ["Discovery"],
  projectStageTitle: "Project Stage",
  nonBillableReasonLabels: [],
  reportTypeGroupIds: { Activity: "g_act" },
};

const ENTRY: MondayEntry = {
  boardId: "b1",
  boardName: "Board 1",
  itemId: "42",
  name: "Atividade",
  url: "https://x.monday.com/42",
  hoursDecimal: 1,
  billable: true,
  activityTypeLabel: "Development",
  projectStageLabel: "",
  statusLabel: "Done",
  period: null,
  mapping: MAPPING,
};

function patch(overrides: Partial<MondayEntryPatch> = {}): MondayEntryPatch {
  return {
    name: "  Nova  ",
    hoursDecimal: 2.5,
    billable: false,
    activityTypeLabel: "Meeting",
    projectStageLabel: "Discovery",
    ...overrides,
  };
}

describe("mondayEntryPatchError", () => {
  it("exige nome e horas finitas não negativas", () => {
    expect(mondayEntryPatchError(patch())).toBeNull();
    expect(mondayEntryPatchError(patch({ hoursDecimal: 0 }))).toBeNull();
    expect(mondayEntryPatchError(patch({ name: " " }))).toBe(MONDAY_ENTRY_NAME_REQUIRED);
    expect(mondayEntryPatchError(patch({ hoursDecimal: -1 }))).toBe(MONDAY_ENTRY_HOURS_INVALID);
    expect(mondayEntryPatchError(patch({ hoursDecimal: Number.NaN }))).toBe(
      MONDAY_ENTRY_HOURS_INVALID
    );
  });
});

describe("buildMondayEntryUpdate", () => {
  it("apara o nome, serializa as colunas e mantém o Status da atividade", () => {
    expect(buildMondayEntryUpdate(ENTRY, patch(), "7")).toEqual({
      name: "Nova",
      hours: "2.5",
      person: { personsAndTeams: [{ id: 7, kind: "person" }] },
      billing: { label: "Non Billable" },
      status: { label: "Done" },
      activity: { label: "Meeting" },
      stage: { label: "Discovery" },
    });
  });

  it("rótulo fora dos do board fica fora do payload", () => {
    const values = buildMondayEntryUpdate(
      ENTRY,
      patch({ activityTypeLabel: "Inexistente", projectStageLabel: "" }),
      "7"
    );
    expect("activity" in values).toBe(false);
    expect("stage" in values).toBe(false);
  });

  it("atividade sem Status não escreve a coluna", () => {
    const values = buildMondayEntryUpdate({ ...ENTRY, statusLabel: "" }, patch(), "7");
    expect("status" in values).toBe(false);
  });
});

describe("updateMondayEntry / deleteMondayEntry", () => {
  it("edita o item no board da atividade", async () => {
    const changeColumnValues = vi.fn(async () => ({ id: "42" }));
    const api = { changeColumnValues } as unknown as IMondayApi;
    await updateMondayEntry(api, ENTRY, patch(), "7");
    expect(changeColumnValues).toHaveBeenCalledWith(
      "b1",
      "42",
      buildMondayEntryUpdate(ENTRY, patch(), "7")
    );
  });

  it("exclui no Monday e depois limpa o rastreamento", async () => {
    const calls: string[] = [];
    const api = {
      deleteItem: vi.fn(async () => {
        calls.push("monday");
      }),
    } as unknown as IMondayApi;
    const repo = {
      deleteItem: vi.fn(async () => {
        calls.push("repo");
      }),
    };
    await deleteMondayEntry(api, repo, ENTRY);
    expect(api.deleteItem).toHaveBeenCalledWith("42");
    expect(repo.deleteItem).toHaveBeenCalledWith("b1", "42");
    expect(calls).toEqual(["monday", "repo"]);
  });

  it("falha no Monday não limpa o rastreamento", async () => {
    const api = {
      deleteItem: vi.fn(async () => {
        throw new Error("falhou");
      }),
    } as unknown as IMondayApi;
    const repo = { deleteItem: vi.fn(async () => {}) };
    await expect(deleteMondayEntry(api, repo, ENTRY)).rejects.toThrow("falhou");
    expect(repo.deleteItem).not.toHaveBeenCalled();
  });
});
