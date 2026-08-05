import { getDb } from "./db";
import type { ITrackedMeetingRepository } from "@domain/integrations/ITrackedMeetingRepository";
import type { TrackedMeeting } from "@domain/integrations/TrackedMeeting";

interface TrackedMeetingRow {
  calendar_event_id: string;
  date: string;
  title: string;
  start_iso: string;
  end_iso: string | null;
  started_task_id: string | null;
  planned_task_id: string | null;
  start_prompted_at: string | null;
  start_dismissed: number;
  end_prompt_count: number;
  last_end_prompt_at: string | null;
  ended: number;
}

function rowToMeeting(r: TrackedMeetingRow): TrackedMeeting {
  return {
    calendarEventId: r.calendar_event_id,
    date: r.date,
    title: r.title,
    startISO: r.start_iso,
    endISO: r.end_iso,
    startedTaskId: r.started_task_id,
    plannedTaskId: r.planned_task_id,
    startPromptedAt: r.start_prompted_at,
    startDismissed: r.start_dismissed === 1,
    endPromptCount: r.end_prompt_count,
    lastEndPromptAt: r.last_end_prompt_at,
    ended: r.ended === 1,
  };
}

export class TrackedMeetingRepository implements ITrackedMeetingRepository {
  async listForDate(dateISO: string): Promise<TrackedMeeting[]> {
    const db = await getDb();
    const rows = await db.select<TrackedMeetingRow[]>(
      "SELECT * FROM calendar_tracked_meetings WHERE date = $1 ORDER BY start_iso ASC",
      [dateISO]
    );
    return rows.map(rowToMeeting);
  }

  async upsert(m: TrackedMeeting): Promise<void> {
    const db = await getDb();
    await db.execute(
      `INSERT INTO calendar_tracked_meetings
        (calendar_event_id, date, title, start_iso, end_iso, started_task_id,
         planned_task_id, start_prompted_at, start_dismissed, end_prompt_count,
         last_end_prompt_at, ended)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
       ON CONFLICT(calendar_event_id) DO UPDATE SET
         date=$2, title=$3, start_iso=$4, end_iso=$5, started_task_id=$6,
         planned_task_id=$7, start_prompted_at=$8, start_dismissed=$9,
         end_prompt_count=$10, last_end_prompt_at=$11, ended=$12`,
      [
        m.calendarEventId,
        m.date,
        m.title,
        m.startISO,
        m.endISO,
        m.startedTaskId,
        m.plannedTaskId,
        m.startPromptedAt,
        m.startDismissed ? 1 : 0,
        m.endPromptCount,
        m.lastEndPromptAt,
        m.ended ? 1 : 0,
      ]
    );
  }

  async setPlannedTaskId(calendarEventId: string, plannedTaskId: string): Promise<void> {
    const db = await getDb();
    await db.execute(
      "UPDATE calendar_tracked_meetings SET planned_task_id = $2 WHERE calendar_event_id = $1",
      [calendarEventId, plannedTaskId]
    );
  }

  async remove(calendarEventId: string): Promise<void> {
    const db = await getDb();
    await db.execute("DELETE FROM calendar_tracked_meetings WHERE calendar_event_id = $1", [
      calendarEventId,
    ]);
  }

  async pruneBefore(dateISO: string): Promise<void> {
    const db = await getDb();
    await db.execute("DELETE FROM calendar_tracked_meetings WHERE date < $1", [dateISO]);
  }
}
