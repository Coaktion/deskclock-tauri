import { describe, it, expect, vi } from "vitest";
import type { PlannedTask } from "@domain/entities/PlannedTask";
import type { ITrackedMondayItemRepository } from "@domain/integrations/ITrackedMondayItemRepository";
import type { TrackedMondayItem } from "@domain/integrations/TrackedMondayItem";
import type { IPlannedTaskRepository } from "@domain/repositories/IPlannedTaskRepository";
import { findImportedMondayItems } from "@domain/usecases/monday/findImportedMondayItems";

const WORKSPACE_ID = "ws-1";

function tracked(mondayItemId: string, plannedTaskId: string): TrackedMondayItem {
  return {
    mondayItemId,
    workspaceId: WORKSPACE_ID,
    boardId: "b1",
    plannedTaskId,
    snapshot: { name: "Item", period: null, activityTypeLabel: "", projectStageLabel: "" },
    importedAt: "2026-08-01T10:00:00Z",
    updatedAt: "2026-08-01T10:00:00Z",
  };
}

function planned(id: string, completedDates: string[] = []): PlannedTask {
  return {
    id,
    workspaceId: WORKSPACE_ID,
    name: "Planejada",
    projectId: "p1",
    categoryId: null,
    billable: false,
    scheduleType: "specific_date",
    scheduleDate: "2026-08-03",
    recurringDays: null,
    periodStart: null,
    periodEnd: null,
    completedDates,
    actions: [],
    customValues: {},
    sortOrder: 0,
    createdAt: "2026-08-01T10:00:00Z",
  };
}

/** Repos com só o que o use case usa; o resto lança se for chamado. */
function makeRepos(records: TrackedMondayItem[], living: Record<string, PlannedTask | null>) {
  const trackedRepo = {
    listForWorkspace: vi.fn().mockResolvedValue(records),
    upsert: vi.fn(),
    remove: vi.fn(),
  } as unknown as ITrackedMondayItemRepository;

  const findById = vi.fn(async (id: string) => living[id] ?? null);
  const plannedRepo = { findById } as unknown as IPlannedTaskRepository;

  return { trackedRepo, plannedRepo, findById };
}

describe("findImportedMondayItems", () => {
  it("devolve o item cujo vínculo aponta para uma planejada viva", async () => {
    const { trackedRepo, plannedRepo } = makeRepos([tracked("i1", "pt1")], { pt1: planned("pt1") });

    const result = await findImportedMondayItems(
      { trackedRepo, plannedRepo },
      ["i1"],
      WORKSPACE_ID
    );

    expect([...result]).toEqual(["i1"]);
  });

  it("devolve o item mesmo com a planejada já concluída — reimportar duplicaria", async () => {
    const { trackedRepo, plannedRepo } = makeRepos([tracked("i1", "pt1")], {
      pt1: planned("pt1", ["2026-08-03"]),
    });

    const result = await findImportedMondayItems(
      { trackedRepo, plannedRepo },
      ["i1"],
      WORKSPACE_ID
    );

    expect([...result]).toEqual(["i1"]);
  });

  it("deixa de fora o item cuja planejada foi apagada à mão — o modal é a única volta", async () => {
    const { trackedRepo, plannedRepo } = makeRepos([tracked("i1", "pt1")], { pt1: null });

    const result = await findImportedMondayItems(
      { trackedRepo, plannedRepo },
      ["i1"],
      WORKSPACE_ID
    );

    expect(result.size).toBe(0);
  });

  it("deixa de fora o item que nunca foi importado", async () => {
    const { trackedRepo, plannedRepo } = makeRepos([], {});

    const result = await findImportedMondayItems(
      { trackedRepo, plannedRepo },
      ["i1"],
      WORKSPACE_ID
    );

    expect(result.size).toBe(0);
  });

  it("confere a existência só dos itens à vista, não de todo o rastreamento", async () => {
    const { trackedRepo, plannedRepo, findById } = makeRepos(
      [tracked("i1", "pt1"), tracked("i2", "pt2"), tracked("i3", "pt3")],
      { pt1: planned("pt1"), pt2: planned("pt2"), pt3: planned("pt3") }
    );

    const result = await findImportedMondayItems(
      { trackedRepo, plannedRepo },
      ["i2"],
      WORKSPACE_ID
    );

    expect([...result]).toEqual(["i2"]);
    expect(findById).toHaveBeenCalledTimes(1);
    expect(findById).toHaveBeenCalledWith("pt2");
  });

  it("não consulta nada quando a busca não trouxe item algum", async () => {
    const { trackedRepo, plannedRepo, findById } = makeRepos([tracked("i1", "pt1")], {
      pt1: planned("pt1"),
    });

    const result = await findImportedMondayItems({ trackedRepo, plannedRepo }, [], WORKSPACE_ID);

    expect(result.size).toBe(0);
    expect(trackedRepo.listForWorkspace).not.toHaveBeenCalled();
    expect(findById).not.toHaveBeenCalled();
  });
});
