import type { TrackedMeeting } from "./TrackedMeeting";

/**
 * Persistência do estado de rastreamento de reuniões. Implementada em `infra/`
 * (SQLite). A identidade de calendário fica confinada a este store — as
 * entidades núcleo permanecem agnósticas à integração.
 */
export interface ITrackedMeetingRepository {
  /** Reuniões rastreadas de uma data local "YYYY-MM-DD". */
  listForDate(dateISO: string): Promise<TrackedMeeting[]>;
  /** Insere ou atualiza (por calendarEventId) uma reunião rastreada. */
  upsert(meeting: TrackedMeeting): Promise<void>;
  /** Remove reuniões anteriores à data informada (poda de dias passados). */
  pruneBefore(dateISO: string): Promise<void>;
}
