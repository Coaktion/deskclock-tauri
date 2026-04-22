import { getDb } from "./db";
import type { ITaskIntegrationLogRepository } from "@domain/repositories/ITaskIntegrationLogRepository";
import type { UUID } from "@shared/types";

export class TaskIntegrationLogRepository implements ITaskIntegrationLogRepository {
  async markSent(taskIds: UUID[], integration: string): Promise<void> {
    if (taskIds.length === 0) return;
    const db = await getDb();
    const sentAt = new Date().toISOString();
    for (const taskId of taskIds) {
      await db.execute(
        `INSERT INTO task_integration_log (task_id, integration, sent_at)
         VALUES ($1, $2, $3)
         ON CONFLICT(task_id, integration) DO UPDATE SET sent_at = excluded.sent_at`,
        [taskId, integration, sentAt]
      );
    }
  }

  async findSentIds(integration: string, startISO?: string, endISO?: string): Promise<UUID[]> {
    const db = await getDb();
    if (startISO && endISO) {
      const rows = await db.select<{ task_id: string }[]>(
        `SELECT l.task_id FROM task_integration_log l
         JOIN tasks t ON t.id = l.task_id
         WHERE l.integration = $1
           AND t.start_time >= $2
           AND t.start_time <= $3`,
        [integration, startISO, endISO]
      );
      return rows.map((r) => r.task_id);
    }
    const rows = await db.select<{ task_id: string }[]>(
      `SELECT task_id FROM task_integration_log WHERE integration = $1`,
      [integration]
    );
    return rows.map((r) => r.task_id);
  }
}
