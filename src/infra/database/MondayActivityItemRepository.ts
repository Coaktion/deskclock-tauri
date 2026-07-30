import { getDb } from "./db";
import type {
  IMondayActivityItemRepository,
  MondayActivityItemRecord,
} from "@domain/repositories/IMondayActivityItemRepository";

interface MondayActivityItemRow {
  board_id: string;
  item_id: string;
  signature: string;
  day_iso: string;
  task_ids: string;
  payload: string;
}

function toRecord(row: MondayActivityItemRow): MondayActivityItemRecord {
  let taskIds: string[] = [];
  try {
    const parsed: unknown = JSON.parse(row.task_ids);
    if (Array.isArray(parsed))
      taskIds = parsed.filter((id): id is string => typeof id === "string");
  } catch {
    // linha corrompida: trata como sem tarefas, a assinatura ainda reencontra o item
  }
  return {
    boardId: row.board_id,
    itemId: row.item_id,
    signature: row.signature,
    dayISO: row.day_iso,
    taskIds,
    payload: row.payload,
  };
}

const SELECT_COLUMNS = "board_id, item_id, signature, day_iso, task_ids, payload";

export class MondayActivityItemRepository implements IMondayActivityItemRepository {
  async findCandidates(
    boardId: string,
    dayISO: string,
    signature: string,
    taskIds: string[]
  ): Promise<MondayActivityItemRecord[]> {
    const db = await getDb();

    const exact = await db.select<MondayActivityItemRow[]>(
      `SELECT ${SELECT_COLUMNS} FROM monday_activity_items
       WHERE board_id = $1 AND signature = $2
       ORDER BY updated_at DESC`,
      [boardId, signature]
    );
    const candidates = exact.map(toRecord);
    if (taskIds.length === 0) return candidates;

    // A assinatura muda quando o usuário renomeia a tarefa ou troca a categoria;
    // as tarefas que compõem o item, não. Poucas linhas por board+dia.
    const sameDay = await db.select<MondayActivityItemRow[]>(
      `SELECT ${SELECT_COLUMNS} FROM monday_activity_items
       WHERE board_id = $1 AND day_iso = $2
       ORDER BY updated_at DESC`,
      [boardId, dayISO]
    );
    const wanted = new Set(taskIds);
    const seen = new Set(candidates.map((c) => c.itemId));

    for (const record of sameDay.map(toRecord)) {
      if (seen.has(record.itemId)) continue;
      if (record.taskIds.some((id) => wanted.has(id))) {
        candidates.push(record);
        seen.add(record.itemId);
      }
    }
    return candidates;
  }

  async save(record: MondayActivityItemRecord): Promise<void> {
    const db = await getDb();
    await db.execute(
      `INSERT INTO monday_activity_items
         (board_id, item_id, signature, day_iso, task_ids, payload, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT(board_id, item_id) DO UPDATE SET
         signature = excluded.signature,
         day_iso = excluded.day_iso,
         task_ids = excluded.task_ids,
         payload = excluded.payload,
         updated_at = excluded.updated_at`,
      [
        record.boardId,
        record.itemId,
        record.signature,
        record.dayISO,
        JSON.stringify(record.taskIds),
        record.payload,
        new Date().toISOString(),
      ]
    );
  }

  async deleteItem(boardId: string, itemId: string): Promise<void> {
    const db = await getDb();
    await db.execute(`DELETE FROM monday_activity_items WHERE board_id = $1 AND item_id = $2`, [
      boardId,
      itemId,
    ]);
  }
}
