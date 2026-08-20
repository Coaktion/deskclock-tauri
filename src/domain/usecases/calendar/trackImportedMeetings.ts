import type { CalendarEvent } from "@domain/integrations/ICalendarImporter";
import type { ITrackedMeetingRepository } from "@domain/integrations/ITrackedMeetingRepository";
import type { TrackedMeeting } from "@domain/integrations/TrackedMeeting";
import { composeLocalISO, composeMeetingEndISO } from "./meetingTime";

/**
 * Evento importado à mão e a planejada que ele acabou de criar. O par vem da
 * ordem em que `importCalendarEvents` devolve as planejadas — é o mesmo contrato
 * que o rastreamento automático usa para gravar o vínculo.
 */
export interface ImportedMeetingLink {
  event: CalendarEvent;
  plannedTaskId: string;
}

export interface TrackImportedMeetingsResult {
  /** Quantas reuniões passaram a ser rastreadas. */
  tracked: number;
  /**
   * Falhas, uma mensagem cada. O import já está gravado quando este passo roda,
   * então uma falha aqui custa o aviso da reunião — nunca a planejada.
   */
  errors: string[];
}

/**
 * Rastreia as reuniões vindas do import manual do Google Agenda, para que elas
 * produzam os avisos de início e de fim que hoje só o rastreamento automático
 * produz.
 *
 * A linha nasce **já vinculada** à planejada criada: o vínculo é o sinal forte
 * que reconhece a reunião iniciada pelo Play na planejada, e é o que faz o
 * prompt de início herdar projeto, categoria e campos personalizados dela.
 *
 * Três descartes, cada um por um motivo distinto:
 * - **Dia todo ou sem hora de início**: sem `startISO` não há instante em que o
 *   prompt possa disparar.
 * - **Data anterior a hoje**: a linha nasceria já podável e nunca acordaria.
 * - **Evento já rastreado**: a linha existente pode estar no meio de uma reunião
 *   (`startedTaskId`) ou dispensada, e reescrevê-la ressuscitaria o prompt de
 *   início e apontaria o vínculo para uma planejada duplicada. É a mesma razão
 *   de `setPlannedTaskId` e `setStartedTaskId` serem escritas estreitas.
 *
 * O evento **futuro** é rastreado de propósito: a poda só apaga dias passados, e
 * a checagem de prompts lê o dia corrente — a linha de quinta espera ali até
 * quinta. Só a descoberta automática reconcilia remarcações, então uma reunião
 * cancelada no Google depois do import ainda avisa no horário antigo enquanto o
 * rastreamento automático estiver desligado.
 */
export async function trackImportedMeetings(
  trackedRepo: ITrackedMeetingRepository,
  links: ImportedMeetingLink[],
  todayISO: string
): Promise<TrackImportedMeetingsResult> {
  const trackable = links.filter(
    ({ event }) => !event.allDay && !!event.startTime && event.date >= todayISO
  );
  if (trackable.length === 0) return { tracked: 0, errors: [] };

  const errors: string[] = [];
  // Uma leitura por data, não por evento: o import cobre uma semana inteira, e
  // por evento seriam dezenas de consultas para responder sempre a mesma coisa.
  const knownIds = new Set<string>();
  const unreadableDates = new Set<string>();
  for (const date of new Set(trackable.map((l) => l.event.date))) {
    try {
      for (const m of await trackedRepo.listForDate(date)) knownIds.add(m.calendarEventId);
    } catch (err: unknown) {
      // Sem saber o que já está rastreado no dia, gravar seria apostar em cima
      // de estado alheio — e é justamente o estado que não se pode sobrescrever.
      unreadableDates.add(date);
      errors.push(err instanceof Error ? err.message : String(err));
    }
  }

  let tracked = 0;
  for (const { event, plannedTaskId } of trackable) {
    if (unreadableDates.has(event.date) || knownIds.has(event.id)) continue;

    const meeting: TrackedMeeting = {
      calendarEventId: event.id,
      date: event.date,
      title: event.title,
      startISO: composeLocalISO(event.date, event.startTime!),
      endISO: event.endTime
        ? composeMeetingEndISO(event.date, event.startTime!, event.endTime)
        : null,
      startedTaskId: null,
      plannedTaskId,
      startPromptedAt: null,
      startDismissed: false,
      endPromptCount: 0,
      lastEndPromptAt: null,
      ended: false,
    };

    // Uma reunião que falha não pode levar as seguintes — o mesmo contrato do
    // `ensurePlannedTasks`, e aqui vale ainda mais: as planejadas já existem.
    try {
      await trackedRepo.upsert(meeting);
      knownIds.add(event.id);
      tracked++;
    } catch (err: unknown) {
      errors.push(err instanceof Error ? err.message : String(err));
    }
  }

  return { tracked, errors };
}
