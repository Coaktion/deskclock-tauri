import { getCategories } from "@domain/usecases/categories/GetCategories";
import {
  importCalendarSelection,
  planCalendarImport,
  type CalendarImportSelection,
} from "@domain/usecases/calendar/importCalendarSelection";
import {
  loadCalendarImportCandidates,
  type CalendarImportCandidate,
} from "@domain/usecases/calendar/loadCalendarImportCandidates";
import { getProjects } from "@domain/usecases/projects/GetProjects";
import { DomainError } from "@shared/errors";
import { weekBoundsOf } from "@shared/utils/time";
import { loadCatalogNames, toPlannedTaskDto } from "../dto";
import {
  assertAllFound,
  assertConfigured,
  importBody,
  optionalBoolean,
  overrideCategory,
  overrideProject,
  selectionList,
  type ImportBody,
} from "../importInput";
import { assertDate } from "../period";
import type { LocalApiDeps, LocalApiHandler } from "../types";

// "Importar eventos" do Google Agenda pela API local (`mcp.md` §7, Fase D1).
// A regra é a do modal: `loadCalendarImportCandidates` monta a lista e
// `planCalendarImport` + `importCalendarSelection` gravam.

/**
 * Período em dias locais. Sem nada, a semana corrente — o padrão do modal; só
 * `from`, o próprio dia; só `to`, do começo da semana corrente até ele.
 */
function calendarPeriod(deps: LocalApiDeps, from: unknown, to: unknown) {
  const week = weekBoundsOf(deps.todayISO(), deps.weekStartsOn());
  const fromDay = typeof from === "string" && from ? from : week.start;
  const toDay = typeof to === "string" && to ? to : from ? fromDay : week.end;
  assertDate(fromDay, "from");
  assertDate(toDay, "to");
  if (fromDay > toDay) throw new DomainError("from não pode ser posterior a to");
  return { fromDay, toDay };
}

async function loadCandidates(deps: LocalApiDeps, from: unknown, to: unknown) {
  const source = deps.imports.calendar();
  assertConfigured(source);
  const { fromDay, toDay } = calendarPeriod(deps, from, to);
  const [projects, categories] = await Promise.all([
    getProjects(deps.projectRepo, source.workspaceId),
    getCategories(deps.categoryRepo, source.workspaceId),
  ]);
  const candidates = await loadCalendarImportCandidates(source.importer, deps.plannedTaskRepo, {
    fromDay,
    toDay,
    workspaceId: source.workspaceId,
    showWeekend: source.showWeekend,
    ignoreRules: source.ignoreRules,
    projects,
    categories,
  });
  return { source, fromDay, toDay, candidates };
}

function eventDto({
  event,
  defaults,
  alreadyExists,
  ignored,
  preselected,
}: CalendarImportCandidate) {
  return {
    id: event.id,
    title: event.title,
    date: event.date,
    startTime: event.startTime ?? null,
    endTime: event.endTime ?? null,
    allDay: event.allDay,
    recurring: !!event.recurringEventId,
    link: event.conferenceLink ?? event.htmlLink ?? null,
    projectId: defaults.projectId,
    projectName: defaults.projectName || null,
    categoryId: defaults.categoryId,
    categoryName: defaults.categoryName || null,
    scheduleType: defaults.scheduleType,
    recurringDays: defaults.recurringDays,
    alreadyExists,
    ignored,
    preselected,
  };
}

export const previewCalendarImport: LocalApiHandler = async (deps, params) => {
  const { source, fromDay, toDay, candidates } = await loadCandidates(deps, params.from, params.to);
  return {
    status: 200,
    body: {
      integration: "google_calendar",
      workspaceId: source.workspaceId,
      from: fromDay,
      to: toDay,
      events: candidates.map(eventDto),
    },
  };
};

const SCHEDULE_TYPES = ["specific_date", "recurring"] as const;

function scheduleOf(item: ImportBody, candidate: CalendarImportCandidate) {
  const scheduleType = item.scheduleType ?? candidate.defaults.scheduleType;
  if (!SCHEDULE_TYPES.includes(scheduleType as (typeof SCHEDULE_TYPES)[number])) {
    throw new DomainError("scheduleType deve ser 'specific_date' ou 'recurring'");
  }
  const days = item.recurringDays ?? candidate.defaults.recurringDays;
  if (
    !Array.isArray(days) ||
    days.some((d) => !Number.isInteger(d) || (d as number) < 0 || (d as number) > 6)
  ) {
    throw new DomainError("recurringDays deve ser uma lista de dias de 0 (domingo) a 6 (sábado)");
  }
  return {
    scheduleType: scheduleType as (typeof SCHEDULE_TYPES)[number],
    recurringDays: [...new Set(days as number[])].sort((a, b) => a - b),
  };
}

async function selectionOf(
  deps: LocalApiDeps,
  workspaceId: string,
  item: ImportBody,
  candidate: CalendarImportCandidate
): Promise<CalendarImportSelection> {
  const project = await overrideProject(deps, workspaceId, item);
  const category = await overrideCategory(deps, workspaceId, item);
  // Trocar o projeto na linha zera a categoria, como o autocomplete da tela.
  const categoryId = category.changed
    ? category.categoryId
    : project.changed
      ? null
      : candidate.defaults.categoryId;
  return {
    event: candidate.event,
    projectId: project.changed ? project.projectId : candidate.defaults.projectId,
    categoryId,
    ...scheduleOf(item, candidate),
  };
}

export const importCalendarEventsHandler: LocalApiHandler = async (deps, params) => {
  const body = importBody(params.body);
  const chosen = selectionList<string>(body, "events", "string");
  const addOpenUrlAction = optionalBoolean(body, "addOpenUrlAction", true);
  const trackMeetings = optionalBoolean(body, "trackMeetings", false);
  const { source, candidates } = await loadCandidates(deps, body.from, body.to);

  const byId = new Map(candidates.map((c) => [c.event.id, c]));
  assertAllFound(
    chosen.map((c) => c.id),
    new Set(byId.keys()),
    "Eventos fora do período (ou no fim de semana, com 'Exibir fim de semana' desligado)"
  );

  const selections: CalendarImportSelection[] = [];
  for (const { id, item } of chosen) {
    selections.push(await selectionOf(deps, source.workspaceId, item, byId.get(id)!));
  }
  const plan = planCalendarImport(selections);
  const result = await importCalendarSelection(
    { plannedRepo: deps.plannedTaskRepo, trackedRepo: deps.trackedMeetingRepo },
    plan.inputs,
    {
      workspaceId: source.workspaceId,
      nowISO: deps.nowISO(),
      todayISO: deps.todayISO(),
      addOpenUrlAction,
      trackMeetings,
    }
  );
  if (result.created.length > 0) await deps.notifyPlannedTasksChanged();

  const catalog = await loadCatalogNames(deps, source.workspaceId);
  return {
    status: 200,
    body: {
      workspaceId: source.workspaceId,
      created: result.created.map((task, i) => ({
        eventId: plan.inputs[i].event.id,
        plannedTask: toPlannedTaskDto(task, catalog),
      })),
      mergedEventIds: selections.map((s) => s.event.id).filter((id) => plan.dedupedIds.has(id)),
      trackedMeetings: result.tracked,
      trackErrors: result.trackErrors,
    },
  };
};
