import { getDb } from "./db";
import type { ITaskRepository } from "@domain/repositories/ITaskRepository";
import type { Task, TaskStatus } from "@domain/entities/Task";

interface TaskRow {
  id: string;
  name: string | null;
  project_id: string | null;
  category_id: string | null;
  billable: number;
  start_time: string;
  end_time: string | null;
  duration_seconds: number | null;
  status: string;
  created_at: string;
  updated_at: string;
}

function rowToTask(r: TaskRow): Task {
  return {
    id: r.id,
    name: r.name,
    projectId: r.project_id,
    categoryId: r.category_id,
    billable: r.billable === 1,
    startTime: r.start_time,
    endTime: r.end_time,
    durationSeconds: r.duration_seconds,
    status: r.status as TaskStatus,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

export class TaskRepository implements ITaskRepository {
  async save(task: Task): Promise<void> {
    const db = await getDb();
    await db.execute(
      `INSERT INTO tasks
        (id, name, project_id, category_id, billable, start_time, end_time,
         duration_seconds, status, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
      [
        task.id,
        task.name,
        task.projectId,
        task.categoryId,
        task.billable ? 1 : 0,
        task.startTime,
        task.endTime,
        task.durationSeconds,
        task.status,
        task.createdAt,
        task.updatedAt,
      ]
    );
  }

  async update(task: Task): Promise<void> {
    const db = await getDb();
    await db.execute(
      `UPDATE tasks SET
        name = $1, project_id = $2, category_id = $3, billable = $4,
        start_time = $5, end_time = $6, duration_seconds = $7,
        status = $8, updated_at = $9
       WHERE id = $10`,
      [
        task.name,
        task.projectId,
        task.categoryId,
        task.billable ? 1 : 0,
        task.startTime,
        task.endTime,
        task.durationSeconds,
        task.status,
        task.updatedAt,
        task.id,
      ]
    );
  }

  async findById(id: string): Promise<Task | null> {
    const db = await getDb();
    const rows = await db.select<TaskRow[]>("SELECT * FROM tasks WHERE id = $1", [id]);
    return rows[0] ? rowToTask(rows[0]) : null;
  }

  async findByStatus(status: "running" | "paused"): Promise<Task[]> {
    const db = await getDb();
    const rows = await db.select<TaskRow[]>(
      "SELECT * FROM tasks WHERE status = $1 ORDER BY start_time ASC",
      [status]
    );
    return rows.map(rowToTask);
  }

  async findByDateRange(startISO: string, endISO: string): Promise<Task[]> {
    const db = await getDb();
    const rows = await db.select<TaskRow[]>(
      "SELECT * FROM tasks WHERE start_time >= $1 AND start_time <= $2 ORDER BY start_time ASC",
      [startISO, endISO]
    );
    return rows.map(rowToTask);
  }

  async delete(id: string): Promise<void> {
    const db = await getDb();
    await db.execute("DELETE FROM tasks WHERE id = $1", [id]);
  }

  async deleteMany(ids: string[]): Promise<void> {
    if (ids.length === 0) return;
    const db = await getDb();
    const placeholders = ids.map((_, i) => `$${i + 1}`).join(", ");
    await db.execute(`DELETE FROM tasks WHERE id IN (${placeholders})`, ids);
  }
}
