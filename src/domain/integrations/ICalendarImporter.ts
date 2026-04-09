export interface CalendarEvent {
  id: string;
  title: string;
  /** Data local no formato "YYYY-MM-DD" */
  date: string;
  /** Horário de início "HH:MM" — ausente se evento de dia inteiro */
  startTime?: string;
  /** Horário de fim "HH:MM" — ausente se evento de dia inteiro */
  endTime?: string;
  allDay: boolean;
  /** ID do evento recorrente base, presente quando é instância de série */
  recurringEventId?: string;
  /**
   * Dias da semana sugeridos para recorrência, extraídos do RRULE (0=Dom…6=Sáb).
   * Preenchido apenas quando o evento é recorrente e o padrão é suportado.
   */
  suggestedRecurringDays?: number[];
}

export interface ICalendarImporter {
  /**
   * Retorna eventos do calendário primário no intervalo [fromISO, toISO].
   * fromISO e toISO são strings ISO 8601 (ex: "2026-04-07T00:00:00.000Z").
   */
  getEvents(fromISO: string, toISO: string): Promise<CalendarEvent[]>;
}
