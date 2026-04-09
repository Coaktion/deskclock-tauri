import type { ICalendarImporter, CalendarEvent } from "@domain/integrations/ICalendarImporter";
import type { ConfigContextValue } from "@presentation/contexts/ConfigContext";
import { GoogleTokenManager } from "./google/GoogleTokenManager";

const CALENDAR_API = "https://www.googleapis.com/calendar/v3/calendars/primary/events";

interface GoogleEventDateTime {
  dateTime?: string;
  date?: string;
  timeZone?: string;
}

interface GoogleEvent {
  id: string;
  summary?: string;
  start: GoogleEventDateTime;
  end: GoogleEventDateTime;
  status?: string;
  eventType?: string;
  recurringEventId?: string;
  recurrence?: string[]; // presente apenas no evento base
}

interface GoogleEventsResponse {
  items?: GoogleEvent[];
  error?: { message: string };
}

const BYDAY_MAP: Record<string, number> = {
  SU: 0, MO: 1, TU: 2, WE: 3, TH: 4, FR: 5, SA: 6,
};

/** Extrai dias da semana (0–6) de uma string RRULE. */
function parseRRuleDays(rrule: string, fallbackDayOfWeek: number): number[] {
  if (/FREQ=DAILY/.test(rrule)) return [0, 1, 2, 3, 4, 5, 6];

  const bydayMatch = rrule.match(/BYDAY=([A-Z,]+)/);
  if (bydayMatch) {
    const days = bydayMatch[1]
      .split(",")
      .map((d) => BYDAY_MAP[d])
      .filter((d) => d !== undefined);
    if (days.length > 0) return days;
  }

  // FREQ=WEEKLY sem BYDAY → usa o dia da semana do evento
  if (/FREQ=WEEKLY/.test(rrule)) return [fallbackDayOfWeek];

  return [];
}

export class GoogleCalendarImporter implements ICalendarImporter {
  private tokenManager: GoogleTokenManager;

  constructor(config: ConfigContextValue) {
    this.tokenManager = new GoogleTokenManager(config);
  }

  async getEvents(fromISO: string, toISO: string): Promise<CalendarEvent[]> {
    const token = await this.tokenManager.getValidAccessToken();

    const params = new URLSearchParams({
      timeMin: fromISO,
      timeMax: toISO,
      singleEvents: "true",
      orderBy: "startTime",
      maxResults: "250",
    });

    const res = await fetch(`${CALENDAR_API}?${params.toString()}`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    const body: GoogleEventsResponse = await res.json().catch(() => ({}));

    if (!res.ok) {
      throw new Error(
        body?.error?.message ?? `Erro HTTP ${res.status} ao buscar eventos do Google Calendar.`,
      );
    }

    const IGNORED_TYPES = new Set(["workingLocation", "outOfOffice", "focusTime"]);
    const rawEvents = (body.items ?? []).filter(
      (e) =>
        e.status !== "cancelled" &&
        (e.summary ?? "").trim() !== "" &&
        !IGNORED_TYPES.has(e.eventType ?? ""),
    );

    const mapped = rawEvents.map((e) => this.mapEvent(e));

    // Enriquecer com RRULE dos eventos base (batch paralelo)
    const rruleMap = await this.fetchRRules(token, mapped, rawEvents);

    return mapped.map((evt) => {
      if (!evt.recurringEventId) return evt;
      const days = rruleMap.get(evt.recurringEventId);
      return days ? { ...evt, suggestedRecurringDays: days } : evt;
    });
  }

  /**
   * Busca os eventos base de todas as séries recorrentes encontradas e
   * retorna um Map de recurringEventId → days[].
   */
  private async fetchRRules(
    token: string,
    events: CalendarEvent[],
    rawEvents: GoogleEvent[],
  ): Promise<Map<string, number[]>> {
    // Mapeia recurringEventId → dia da semana do evento instância (fallback)
    const fallbackDayMap = new Map<string, number>();
    for (const evt of events) {
      if (evt.recurringEventId && !fallbackDayMap.has(evt.recurringEventId)) {
        const d = new Date(evt.date + "T12:00:00Z");
        fallbackDayMap.set(evt.recurringEventId, d.getUTCDay());
      }
    }

    const uniqueIds = [...fallbackDayMap.keys()];
    if (uniqueIds.length === 0) return new Map();

    // Alguns base events podem já estar em rawEvents (ex: instância coincide com base)
    const knownBase = new Map<string, string[]>();
    for (const raw of rawEvents) {
      if (raw.recurrence?.length) knownBase.set(raw.id, raw.recurrence);
    }

    const results = new Map<string, number[]>();

    await Promise.all(
      uniqueIds.map(async (id) => {
        try {
          const fallback = fallbackDayMap.get(id) ?? 1;
          let recurrence = knownBase.get(id);

          if (!recurrence) {
            const baseEvent = await this.fetchBaseEvent(token, id);
            recurrence = baseEvent?.recurrence;
          }

          if (recurrence?.length) {
            const days = parseRRuleDays(recurrence[0], fallback);
            if (days.length > 0) results.set(id, days);
          }
        } catch {
          // falha ao buscar RRULE de um evento não impede os demais
        }
      }),
    );

    return results;
  }

  private async fetchBaseEvent(token: string, eventId: string): Promise<GoogleEvent | null> {
    const url = `${CALENDAR_API}/${encodeURIComponent(eventId)}`;
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) return null;
    return res.json().catch(() => null);
  }

  private mapEvent(event: GoogleEvent): CalendarEvent {
    const allDay = !event.start.dateTime;

    if (allDay) {
      return {
        id: event.id,
        title: event.summary ?? "(sem título)",
        date: event.start.date!,
        allDay: true,
        recurringEventId: event.recurringEventId,
      };
    }

    const startDate = new Date(event.start.dateTime!);
    const endDate = new Date(event.end.dateTime!);

    const fmt2 = (n: number) => String(n).padStart(2, "0");
    const toDateStr = (d: Date) =>
      `${d.getFullYear()}-${fmt2(d.getMonth() + 1)}-${fmt2(d.getDate())}`;
    const toTimeStr = (d: Date) => `${fmt2(d.getHours())}:${fmt2(d.getMinutes())}`;

    return {
      id: event.id,
      title: event.summary ?? "(sem título)",
      date: toDateStr(startDate),
      startTime: toTimeStr(startDate),
      endTime: toTimeStr(endDate),
      allDay: false,
      recurringEventId: event.recurringEventId,
    };
  }
}
