import { getDb } from "./db";
import type { ITrackedMondayItemRepository } from "@domain/integrations/ITrackedMondayItemRepository";
import type { TrackedMondayItem } from "@domain/integrations/TrackedMondayItem";
import type { UUID } from "@shared/types";

interface MondayImportedItemRow {
  monday_item_id: string;
  workspace_id: string;
  board_id: string;
  planned_task_id: string;
  snap_name: string;
  snap_period_start: string | null;
  snap_period_end: string | null;
  snap_activity: string;
  snap_stage: string;
  imported_at: string;
  updated_at: string;
}

function toRecord(row: MondayImportedItemRow): TrackedMondayItem {
  return {
    mondayItemId: row.monday_item_id,
    workspaceId: row.workspace_id,
    boardId: row.board_id,
    plannedTaskId: row.planned_task_id,
    snapshot: {
      name: row.snap_name,
      // As duas pontas andam juntas: a coluna Timeline nunca tem só o fim.
      period: row.snap_period_start
        ? {
            startDayISO: row.snap_period_start,
            endDayISO: row.snap_period_end ?? row.snap_period_start,
          }
        : null,
      activityTypeLabel: row.snap_activity,
      projectStageLabel: row.snap_stage,
    },
    importedAt: row.imported_at,
    updatedAt: row.updated_at,
  };
}

export class MondayImportedItemRepository implements ITrackedMondayItemRepository {
  async listForWorkspace(workspaceId: UUID): Promise<TrackedMondayItem[]> {
    const db = await getDb();
    const rows = await db.select<MondayImportedItemRow[]>(
      "SELECT * FROM monday_imported_items WHERE workspace_id = $1",
      [workspaceId]
    );
    return rows.map(toRecord);
  }

  async upsert(item: TrackedMondayItem): Promise<void> {
    const db = await getDb();
    await db.execute(
      `INSERT INTO monday_imported_items
         (monday_item_id, workspace_id, board_id, planned_task_id,
          snap_name, snap_period_start, snap_period_end, snap_activity, snap_stage,
          imported_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       ON CONFLICT(monday_item_id, workspace_id) DO UPDATE SET
         board_id = excluded.board_id,
         planned_task_id = excluded.planned_task_id,
         snap_name = excluded.snap_name,
         snap_period_start = excluded.snap_period_start,
         snap_period_end = excluded.snap_period_end,
         snap_activity = excluded.snap_activity,
         snap_stage = excluded.snap_stage,
         updated_at = excluded.updated_at`,
      [
        item.mondayItemId,
        item.workspaceId,
        item.boardId,
        item.plannedTaskId,
        item.snapshot.name,
        item.snapshot.period?.startDayISO ?? null,
        item.snapshot.period?.endDayISO ?? null,
        item.snapshot.activityTypeLabel,
        item.snapshot.projectStageLabel,
        item.importedAt,
        item.updatedAt,
      ]
    );
  }

  async remove(mondayItemId: string, workspaceId: UUID): Promise<void> {
    const db = await getDb();
    await db.execute(
      "DELETE FROM monday_imported_items WHERE monday_item_id = $1 AND workspace_id = $2",
      [mondayItemId, workspaceId]
    );
  }
}
