import { getDb } from "./db";
import type { IPlannedTaskRepository } from "@domain/repositories/IPlannedTaskRepository";
import type { PlannedTask, PlannedTaskAction, ScheduleType } from "@domain/entities/PlannedTask";
import type { UUID } from "@shared/types";

interface PlannedTaskRow {
  id: string;
  name: string;
  project_id: string | null;
  category_id: string | null;
  billable: number;
  schedule_type: string;
  schedule_date: string | null;
  recurring_days: string | null;
  period_start: string | null;
  period_end: string | null;
  completed_dates: string;
  actions: string;
  sort_order: number;
  created_at: string;
}

function rowToTask(r: PlannedTaskRow): PlannedTask {
  return {
    id: r.id,
    name: r.name,
    projectId: r.project_id,
    categoryId: r.category_id,
    billable: r.billable === 1,
    scheduleType: r.schedule_type as ScheduleType,
    scheduleDate: r.schedule_date,
    recurringDays: r.recurring_days ? (JSON.parse(r.recurring_days) as number[]) : null,
    periodStart: r.period_start,
    periodEnd: r.period_end,
    completedDates: JSON.parse(r.completed_dates) as string[],
    actions: JSON.parse(r.actions) as PlannedTaskAction[],
    sortOrder: r.sort_order,
    createdAt: r.created_at,
  };
}

export class PlannedTaskRepository implements IPlannedTaskRepository {
  async save(task: PlannedTask): Promise<void> {
    const db = await getDb();
    await db.execute(
      `INSERT INTO planned_tasks
        (id, name, project_id, category_id, billable, schedule_type,
         schedule_date, recurring_days, period_start, period_end,
         completed_dates, actions, sort_order, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
      [
        task.id,
        task.name,
        task.projectId,
        task.categoryId,
        task.billable ? 1 : 0,
        task.scheduleType,
        task.scheduleDate,
        task.recurringDays ? JSON.stringify(task.recurringDays) : null,
        task.periodStart,
        task.periodEnd,
        JSON.stringify(task.completedDates),
        JSON.stringify(task.actions),
        task.sortOrder,
        task.createdAt,
      ]
    );
  }

  async update(task: PlannedTask): Promise<void> {
    const db = await getDb();
    await db.execute(
      `UPDATE planned_tasks SET
        name=$1, project_id=$2, category_id=$3, billable=$4,
        schedule_type=$5, schedule_date=$6, recurring_days=$7,
        period_start=$8, period_end=$9, completed_dates=$10,
        actions=$11, sort_order=$12
       WHERE id=$13`,
      [
        task.name,
        task.projectId,
        task.categoryId,
        task.billable ? 1 : 0,
        task.scheduleType,
        task.scheduleDate,
        task.recurringDays ? JSON.stringify(task.recurringDays) : null,
        task.periodStart,
        task.periodEnd,
        JSON.stringify(task.completedDates),
        JSON.stringify(task.actions),
        task.sortOrder,
        task.id,
      ]
    );
  }

  async findById(id: UUID): Promise<PlannedTask | null> {
    const db = await getDb();
    const rows = await db.select<PlannedTaskRow[]>(
      "SELECT * FROM planned_tasks WHERE id = $1",
      [id]
    );
    return rows[0] ? rowToTask(rows[0]) : null;
  }

  async findForDate(dateISO: string): Promise<PlannedTask[]> {
    const db = await getDb();
    // Traz todas e filtra em JS para lidar com recurring e period
    const rows = await db.select<PlannedTaskRow[]>(
      `SELECT * FROM planned_tasks
       WHERE schedule_type = 'specific_date' AND schedule_date = $1
          OR schedule_type = 'recurring'
          OR (schedule_type = 'period' AND period_start <= $1 AND (period_end IS NULL OR period_end >= $1))
       ORDER BY sort_order ASC, created_at ASC`,
      [dateISO]
    );
    const dayOfWeek = new Date(dateISO + "T12:00:00Z").getUTCDay();
    return rows
      .map(rowToTask)
      .filter((t) => {
        if (t.scheduleType === "recurring") {
          return Array.isArray(t.recurringDays) && t.recurringDays.includes(dayOfWeek);
        }
        return true;
      });
  }

  async findForWeek(startISO: string, endISO: string): Promise<PlannedTask[]> {
    const db = await getDb();
    const rows = await db.select<PlannedTaskRow[]>(
      `SELECT * FROM planned_tasks
       WHERE (schedule_type = 'specific_date' AND schedule_date >= $1 AND schedule_date <= $2)
          OR schedule_type = 'recurring'
          OR (schedule_type = 'period' AND period_start <= $2 AND (period_end IS NULL OR period_end >= $1))
       ORDER BY sort_order ASC, created_at ASC`,
      [startISO, endISO]
    );
    return rows.map(rowToTask);
  }

  async complete(id: UUID, dateISO: string): Promise<void> {
    const db = await getDb();
    const rows = await db.select<PlannedTaskRow[]>(
      "SELECT completed_dates FROM planned_tasks WHERE id = $1",
      [id]
    );
    if (!rows[0]) return;
    const dates: string[] = JSON.parse(rows[0].completed_dates);
    if (!dates.includes(dateISO)) dates.push(dateISO);
    await db.execute(
      "UPDATE planned_tasks SET completed_dates = $1 WHERE id = $2",
      [JSON.stringify(dates), id]
    );
  }

  async uncomplete(id: UUID, dateISO: string): Promise<void> {
    const db = await getDb();
    const rows = await db.select<PlannedTaskRow[]>(
      "SELECT completed_dates FROM planned_tasks WHERE id = $1",
      [id]
    );
    if (!rows[0]) return;
    const dates: string[] = JSON.parse(rows[0].completed_dates);
    const filtered = dates.filter((d) => d !== dateISO);
    await db.execute(
      "UPDATE planned_tasks SET completed_dates = $1 WHERE id = $2",
      [JSON.stringify(filtered), id]
    );
  }

  async reorder(ids: UUID[]): Promise<void> {
    if (ids.length === 0) return;
    const db = await getDb();
    await Promise.all(
      ids.map((id, idx) =>
        db.execute(
          "UPDATE planned_tasks SET sort_order = $1 WHERE id = $2",
          [idx, id]
        )
      )
    );
  }

  async delete(id: UUID): Promise<void> {
    const db = await getDb();
    await db.execute("DELETE FROM planned_tasks WHERE id = $1", [id]);
  }
}
