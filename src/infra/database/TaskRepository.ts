import { getDb } from "./db";
import { loadCustomValues, saveCustomValues } from "./customValues";
import type { ITaskRepository } from "@domain/repositories/ITaskRepository";
import type { Task, TaskStatus } from "@domain/entities/Task";

interface TaskRow {
  id: string;
  workspace_id: string;
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
  planned_task_id: string | null;
}

function rowToTask(r: TaskRow): Task {
  return {
    id: r.id,
    workspaceId: r.workspace_id,
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
    plannedTaskId: r.planned_task_id,
    customValues: {},
  };
}

/** Uma query de valores para a leva inteira — ver `loadCustomValues`. */
async function hydrate(db: Awaited<ReturnType<typeof getDb>>, rows: TaskRow[]): Promise<Task[]> {
  const tasks = rows.map(rowToTask);
  if (tasks.length === 0) return tasks;
  const values = await loadCustomValues(
    db,
    "task_custom_values",
    "task_id",
    tasks.map((t) => t.id)
  );
  for (const task of tasks) {
    task.customValues = values.get(task.id) ?? {};
  }
  return tasks;
}

export class TaskRepository implements ITaskRepository {
  async save(task: Task): Promise<void> {
    const db = await getDb();
    await db.execute(
      `INSERT INTO tasks
        (id, workspace_id, name, project_id, category_id, billable, start_time, end_time,
         duration_seconds, status, created_at, updated_at, planned_task_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
      [
        task.id,
        task.workspaceId,
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
        task.plannedTaskId ?? null,
      ]
    );
    await saveCustomValues(db, "task_custom_values", "task_id", task.id, task.customValues);
  }

  async update(task: Task): Promise<void> {
    const db = await getDb();
    await db.execute(
      // planned_task_id fica fora do UPDATE: é a origem da execução, imutável
      // depois do início. Incluí-lo faria todo caller que monta uma Task sem o
      // campo (edição, merge, regras pós-parada) apagar o vínculo sem querer.
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
    await saveCustomValues(db, "task_custom_values", "task_id", task.id, task.customValues);
  }

  async findById(id: string): Promise<Task | null> {
    const db = await getDb();
    const rows = await db.select<TaskRow[]>("SELECT * FROM tasks WHERE id = $1", [id]);
    return rows[0] ? (await hydrate(db, rows))[0] : null;
  }

  async findByStatus(status: "running" | "paused"): Promise<Task[]> {
    const db = await getDb();
    const rows = await db.select<TaskRow[]>(
      "SELECT * FROM tasks WHERE status = $1 ORDER BY start_time ASC",
      [status]
    );
    return hydrate(db, rows);
  }

  async findByDateRange(startISO: string, endISO: string, workspaceId?: string): Promise<Task[]> {
    const db = await getDb();
    const rows = workspaceId
      ? await db.select<TaskRow[]>(
          `SELECT * FROM tasks
           WHERE start_time >= $1 AND start_time <= $2 AND workspace_id = $3
           ORDER BY start_time ASC`,
          [startISO, endISO, workspaceId]
        )
      : await db.select<TaskRow[]>(
          "SELECT * FROM tasks WHERE start_time >= $1 AND start_time <= $2 ORDER BY start_time ASC",
          [startISO, endISO]
        );
    return hydrate(db, rows);
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
