import type { PlannedTask } from "@domain/entities/PlannedTask";
import type { ITrackedMeetingRepository } from "@domain/integrations/ITrackedMeetingRepository";
import type { IPlannedTaskRepository } from "@domain/repositories/IPlannedTaskRepository";
import { dedupeCalendarEvents } from "@domain/usecases/plannedTasks/DedupeCalendarEvents";
import {
  importCalendarEvents,
  type ImportEventInput,
} from "@domain/usecases/plannedTasks/ImportCalendarEvents";
import { trackImportedMeetings } from "./trackImportedMeetings";

/** Um evento marcado, com o que a linha dele diz. */
export type CalendarImportSelection = ImportEventInput;

export interface CalendarImportPlan {
  /** Eventos que não viram planejada — já cobertos por outro do lote. */
  dedupedIds: Set<string>;
  /** Dias efetivos de cada sobrevivente, já com os das ocorrências absorvidas. */
  daysById: Map<string, number[]>;
  /** O que de fato vai ao `importCalendarEvents`, na ordem da seleção. */
  inputs: ImportEventInput[];
}

/**
 * O lote que o botão importa: colapsa as recorrentes de mesmo nome e horário
 * (`dedupeCalendarEvents`) e leva aos sobreviventes os dias das absorvidas — a
 * série partida em dois ids pode cobrir dias diferentes em cada metade.
 */
export function planCalendarImport(selections: CalendarImportSelection[]): CalendarImportPlan {
  const { dedupedIds, daysById } = dedupeCalendarEvents(
    selections.map(({ event, scheduleType, recurringDays }) => ({
      id: event.id,
      title: event.title,
      startTime: event.startTime,
      endTime: event.endTime,
      isRecurring: scheduleType === "recurring",
      recurringDays,
    }))
  );
  const inputs = selections
    .filter(({ event }) => !dedupedIds.has(event.id))
    .map((s) => ({ ...s, recurringDays: daysById.get(s.event.id) ?? s.recurringDays }));
  return { dedupedIds, daysById, inputs };
}

export interface ImportCalendarSelectionDeps {
  plannedRepo: IPlannedTaskRepository;
  trackedRepo: ITrackedMeetingRepository;
}

export interface ImportCalendarSelectionParams {
  workspaceId: string;
  nowISO: string;
  todayISO: string;
  addOpenUrlAction: boolean;
  /** "Rastrear reuniões (avisar no início e no fim)". */
  trackMeetings: boolean;
}

export interface ImportCalendarSelectionResult {
  /** Na ordem de `inputs`. */
  created: PlannedTask[];
  /** Reuniões que passaram a avisar — ver {@link trackImportedMeetings}. */
  tracked: number;
  /** Falhas do rastreamento; as planejadas já estão gravadas. */
  trackErrors: string[];
}

/**
 * Grava as planejadas do lote e, com a chave ligada, rastreia as reuniões,
 * emparelhando cada evento com a planejada que ele criou —
 * `importCalendarEvents` devolve as planejadas na ordem das entradas.
 *
 * **Falha no rastreamento não é falha da importação.** As planejadas já estão
 * gravadas quando ele roda; lançar aqui levaria quem chamou a repetir o import
 * e duplicar tudo. Volta em `trackErrors`.
 */
export async function importCalendarSelection(
  { plannedRepo, trackedRepo }: ImportCalendarSelectionDeps,
  inputs: ImportEventInput[],
  params: ImportCalendarSelectionParams
): Promise<ImportCalendarSelectionResult> {
  const created = await importCalendarEvents(
    plannedRepo,
    inputs,
    params.nowISO,
    params.workspaceId,
    params.addOpenUrlAction
  );
  if (!params.trackMeetings) return { created, tracked: 0, trackErrors: [] };

  const links = inputs.map((input, i) => ({
    event: input.event,
    plannedTaskId: created[i].id,
  }));
  try {
    const { tracked, errors } = await trackImportedMeetings(trackedRepo, links, params.todayISO);
    return { created, tracked, trackErrors: errors };
  } catch (err: unknown) {
    return {
      created,
      tracked: 0,
      trackErrors: [err instanceof Error ? err.message : String(err)],
    };
  }
}
