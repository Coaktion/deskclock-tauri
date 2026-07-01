import type { ICalendarImporter } from "@domain/integrations/ICalendarImporter";
import type { ITrackedMeetingRepository } from "@domain/integrations/ITrackedMeetingRepository";
import type { IPlannedTaskRepository } from "@domain/repositories/IPlannedTaskRepository";
import type { IProjectRepository } from "@domain/repositories/IProjectRepository";
import type { ICategoryRepository } from "@domain/repositories/ICategoryRepository";
import { importCalendarEvents } from "@domain/usecases/plannedTasks/ImportCalendarEvents";
import { findByNameCaseInsensitive, parseCalendarMetadata } from "@shared/utils/calendarMetadata";
import { composeLocalISO, composeMeetingEndISO } from "./meetingTime";

export interface SyncTodayMeetingsDeps {
  importer: ICalendarImporter;
  trackedRepo: ITrackedMeetingRepository;
  plannedRepo: IPlannedTaskRepository;
  projectRepo: IProjectRepository;
  categoryRepo: ICategoryRepository;
}

export interface SyncTodayMeetingsResult {
  /** Quantos eventos novos foram rastreados. */
  tracked: number;
  /** Quantas PlannedTasks foram criadas (para o chamador emitir refresh da lista). */
  plannedCreated: number;
}

export interface SyncTodayMeetingsRange {
  /** Data local "YYYY-MM-DD" de hoje. */
  todayISO: string;
  /** Início do intervalo de busca (ISO datetime). */
  fromISO: string;
  /** Fim do intervalo de busca (ISO datetime). */
  toISO: string;
  /** Momento atual (ISO) — usado como createdAt das PlannedTasks. */
  nowISO: string;
}

/**
 * Busca os eventos com horário do dia no Google Agenda e:
 * 1. Rastreia (upsert) apenas eventos NOVOS — não sobrescreve o estado de
 *    rastreamento de eventos já conhecidos (evita perder prompt/started/dismiss).
 * 2. Cria PlannedTasks para eventos cujo nome ainda não está planejado (dedup por nome).
 * 3. Poda reuniões rastreadas de dias anteriores.
 *
 * Projeto e categoria são pré-preenchidos a partir da descrição do evento
 * (mesma convenção do modal manual: "Projeto:" / "Categoria:"), casando por nome
 * contra os cadastros existentes.
 *
 * Retorna a contagem de eventos rastreados e de PlannedTasks criadas.
 */
export async function syncTodayMeetings(
  deps: SyncTodayMeetingsDeps,
  range: SyncTodayMeetingsRange
): Promise<SyncTodayMeetingsResult> {
  const { importer, trackedRepo, plannedRepo, projectRepo, categoryRepo } = deps;
  const { todayISO, fromISO, toISO, nowISO } = range;

  const [events, existing, plannedToday, projects, categories] = await Promise.all([
    importer.getEvents(fromISO, toISO),
    trackedRepo.listForDate(todayISO),
    plannedRepo.findForDate(todayISO),
    projectRepo.findAll(),
    categoryRepo.findAll(),
  ]);

  const existingIds = new Set(existing.map((m) => m.calendarEventId));
  const plannedNames = new Set(plannedToday.map((t) => t.name.toLowerCase().trim()));
  const timed = events.filter((e) => !e.allDay && !!e.startTime);

  const newPlannedInputs: Parameters<typeof importCalendarEvents>[1] = [];
  let tracked = 0;

  for (const e of timed) {
    if (existingIds.has(e.id)) continue;

    await trackedRepo.upsert({
      calendarEventId: e.id,
      date: e.date,
      title: e.title,
      startISO: composeLocalISO(e.date, e.startTime!),
      endISO: e.endTime ? composeMeetingEndISO(e.date, e.startTime!, e.endTime) : null,
      startedTaskId: null,
      startPromptedAt: null,
      startDismissed: false,
      endPromptCount: 0,
      lastEndPromptAt: null,
      ended: false,
    });
    tracked++;

    const nameKey = e.title.toLowerCase().trim();
    if (!plannedNames.has(nameKey)) {
      plannedNames.add(nameKey);
      const meta = parseCalendarMetadata(e.description);
      newPlannedInputs.push({
        event: e,
        projectId: findByNameCaseInsensitive(meta.projectName, projects)?.id ?? null,
        categoryId: findByNameCaseInsensitive(meta.categoryName, categories)?.id ?? null,
        scheduleType: "specific_date",
        recurringDays: [],
      });
    }
  }

  if (newPlannedInputs.length > 0) {
    await importCalendarEvents(plannedRepo, newPlannedInputs, nowISO, true);
  }

  await trackedRepo.pruneBefore(todayISO);
  return { tracked, plannedCreated: newPlannedInputs.length };
}
