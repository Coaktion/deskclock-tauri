import { describe, it, expect, vi, beforeEach } from "vitest";

const mockDb = {
  select: vi.fn(),
  execute: vi.fn(),
};

vi.mock("@infra/database/db", () => ({
  getDb: vi.fn(async () => mockDb),
}));

const { MondayImportedItemRepository } =
  await import("@infra/database/MondayImportedItemRepository");

const WORKSPACE = "ws-1";

function row(overrides: Record<string, unknown> = {}) {
  return {
    monday_item_id: "i1",
    workspace_id: WORKSPACE,
    board_id: "b1",
    planned_task_id: "pt-1",
    snap_name: "Desenvolvimento",
    snap_period_start: "2026-08-03",
    snap_period_end: "2026-08-07",
    snap_activity: "Development",
    snap_stage: "UAT",
    imported_at: "2026-08-01T10:00:00Z",
    updated_at: "2026-08-02T10:00:00Z",
    ...overrides,
  };
}

describe("MondayImportedItemRepository", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDb.select.mockResolvedValue([]);
    mockDb.execute.mockResolvedValue({ rowsAffected: 1, lastInsertId: 0 });
  });

  describe("listForWorkspace", () => {
    it("monta o snapshot a partir das colunas", async () => {
      mockDb.select.mockResolvedValueOnce([row()]);
      const repo = new MondayImportedItemRepository();

      await expect(repo.listForWorkspace(WORKSPACE)).resolves.toEqual([
        {
          mondayItemId: "i1",
          workspaceId: WORKSPACE,
          boardId: "b1",
          plannedTaskId: "pt-1",
          snapshot: {
            name: "Desenvolvimento",
            period: { startDayISO: "2026-08-03", endDayISO: "2026-08-07" },
            activityTypeLabel: "Development",
            projectStageLabel: "UAT",
          },
          importedAt: "2026-08-01T10:00:00Z",
          updatedAt: "2026-08-02T10:00:00Z",
        },
      ]);
    });

    it("item sem cronograma volta com período nulo", async () => {
      mockDb.select.mockResolvedValueOnce([
        row({ snap_period_start: null, snap_period_end: null }),
      ]);
      const repo = new MondayImportedItemRepository();

      const [record] = await repo.listForWorkspace(WORKSPACE);
      expect(record.snapshot.period).toBeNull();
    });

    it("só lê o workspace pedido: a planejada nasce em um deles", async () => {
      const repo = new MondayImportedItemRepository();
      await repo.listForWorkspace(WORKSPACE);

      expect(mockDb.select).toHaveBeenCalledWith(expect.stringContaining("workspace_id = $1"), [
        WORKSPACE,
      ]);
    });
  });

  it("upsert atualiza a linha existente do par item + workspace", async () => {
    const repo = new MondayImportedItemRepository();
    await repo.upsert({
      mondayItemId: "i1",
      workspaceId: WORKSPACE,
      boardId: "b1",
      plannedTaskId: "pt-2",
      snapshot: {
        name: "Novo nome",
        period: null,
        activityTypeLabel: "",
        projectStageLabel: "",
      },
      importedAt: "2026-08-01T10:00:00Z",
      updatedAt: "2026-08-03T12:00:00Z",
    });

    const [sql, params] = mockDb.execute.mock.calls[0];
    expect(sql).toContain("ON CONFLICT(monday_item_id, workspace_id) DO UPDATE");
    expect(params).toEqual([
      "i1",
      WORKSPACE,
      "b1",
      "pt-2",
      "Novo nome",
      null,
      null,
      "",
      "",
      "2026-08-01T10:00:00Z",
      "2026-08-03T12:00:00Z",
    ]);
  });

  it("remove apaga só o vínculo daquele workspace", async () => {
    const repo = new MondayImportedItemRepository();
    await repo.remove("i1", WORKSPACE);

    const [sql, params] = mockDb.execute.mock.calls[0];
    expect(sql).toContain("DELETE FROM monday_imported_items");
    expect(params).toEqual(["i1", WORKSPACE]);
  });
});
