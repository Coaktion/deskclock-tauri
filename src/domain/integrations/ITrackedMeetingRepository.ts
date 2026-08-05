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
  /**
   * Grava só o vínculo com a planejada.
   *
   * Existe para **não** reescrever a linha inteira: o `upsert` parte de um objeto
   * lido antes, e o prompt de reunião grava `startedTaskId` fora do ciclo de
   * sincronização. Um upsert de linha inteira em cima disso devolveria
   * `startedTaskId` a null, e a reunião voltaria a parecer não iniciada — o prompt
   * de início seria reoferecido e o de término nunca dispararia.
   */
  setPlannedTaskId(calendarEventId: string, plannedTaskId: string): Promise<void>;
  /** Remove uma reunião rastreada pelo ID do evento (ex.: cancelada/movida de dia). */
  remove(calendarEventId: string): Promise<void>;
  /** Remove reuniões anteriores à data informada (poda de dias passados). */
  pruneBefore(dateISO: string): Promise<void>;
}
