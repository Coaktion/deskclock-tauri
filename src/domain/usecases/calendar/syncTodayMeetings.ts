import type { CalendarEvent, ICalendarImporter } from "@domain/integrations/ICalendarImporter";
import type { ITrackedMeetingRepository } from "@domain/integrations/ITrackedMeetingRepository";
import type { TrackedMeeting } from "@domain/integrations/TrackedMeeting";
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
 * 1. Rastreia (upsert) eventos NOVOS — sem sobrescrever o estado de rastreamento
 *    de eventos já conhecidos (evita perder prompt/started/dismiss).
 * 2. Reconcilia reuniões já rastreadas contra a agenda atual: remarcações no
 *    mesmo dia atualizam o horário (e reabrem o prompt no horário novo);
 *    reuniões que sumiram de hoje (canceladas ou movidas para outro dia) e ainda
 *    não iniciadas são removidas, para não notificar um horário que não existe mais.
 * 3. Cria PlannedTasks para eventos cujo nome ainda não está planejado (dedup por nome).
 * 4. Poda reuniões rastreadas de dias anteriores.
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
  const timedById = new Map(timed.map((e) => [e.id, e]));

  // Reconcilia o que já era rastreado contra a agenda atual (remarcações/cancelamentos).
  await reconcileTracked(trackedRepo, existing, timedById);

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

/**
 * Alinha as reuniões já rastreadas de hoje com o estado atual da agenda:
 * - Evento sumiu de hoje (cancelado ou movido para outro dia): remove o
 *   rastreamento se ainda não foi iniciado como tarefa. Já iniciado permanece —
 *   o prompt de fim cuida do encerramento. (Movido para outro dia é re-inserido
 *   pelo sync daquele dia via upsert, pois deixa de constar em listForDate hoje.)
 * - Evento remarcado no mesmo dia (horário/término mudou): atualiza os horários.
 *   Se ainda não iniciado, reabre o prompt no horário novo (zera startPromptedAt
 *   e startDismissed — a remarcação é tratada como uma reunião nova).
 * - Sem mudança: não faz nada, para não re-perguntar a cada ciclo de sync.
 */
async function reconcileTracked(
  trackedRepo: ITrackedMeetingRepository,
  existing: TrackedMeeting[],
  timedById: Map<string, CalendarEvent>
): Promise<void> {
  for (const m of existing) {
    const event = timedById.get(m.calendarEventId);

    if (!event) {
      if (!m.startedTaskId) await trackedRepo.remove(m.calendarEventId);
      continue;
    }

    const startISO = composeLocalISO(event.date, event.startTime!);
    const endISO = event.endTime
      ? composeMeetingEndISO(event.date, event.startTime!, event.endTime)
      : null;
    const moved = startISO !== m.startISO || endISO !== m.endISO;
    if (!moved && event.title === m.title) continue;

    await trackedRepo.upsert({
      ...m,
      title: event.title,
      startISO,
      endISO,
      // Reunião já em andamento: só acompanha o novo horário; não reabre início.
      startPromptedAt: !m.startedTaskId && moved ? null : m.startPromptedAt,
      startDismissed: !m.startedTaskId && moved ? false : m.startDismissed,
    });
  }
}
