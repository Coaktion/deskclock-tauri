import {
  clockifyEntriesHiddenByTags,
  clockifyEntryDurationSeconds,
  groupClockifyEntriesByDay,
  projectDisplayName,
  visibleClockifyEntries,
} from "@domain/usecases/clockify/clockifyEntries";
import {
  groupMondayEntriesByDay,
  loadMondayEntries,
  MONDAY_ENTRIES_WINDOWS,
  mondayEntriesInRange,
  mondayEntriesWindow,
  type MondayEntriesWindow,
  type MondayEntry,
} from "@domain/usecases/monday/mondayEntries";
import { DomainError } from "@shared/errors";
import type { ClockifyTimeEntryFull } from "@shared/types/clockify";
import { endOfDayISO, startOfDayISO } from "@shared/utils/time";
import { assertConfigured } from "../importInput";
import { periodRange } from "../period";
import type { LocalApiHandler } from "../types";

// Os lançamentos já feitos no Clockify e no Monday pela API local (`mcp.md` §7,
// Fase D2): a leitura do período, como "Apontamentos do Clockify" e
// "Atividades no Monday" a mostram. Criar, editar e excluir lançamento, que os
// modais também fazem, não entram nesta fase.

function clockifyEntryDto(entry: ClockifyTimeEntryFull) {
  return {
    id: entry.id,
    description: entry.description ?? "",
    start: entry.timeInterval.start,
    end: entry.timeInterval.end,
    durationSeconds: clockifyEntryDurationSeconds(entry),
    billable: entry.billable,
    project: entry.project
      ? {
          id: entry.project.id,
          name: projectDisplayName(entry.project),
          color: entry.project.color ?? null,
        }
      : null,
    tags: (entry.tags ?? []).map((tag) => ({ id: tag.id, name: tag.name })),
  };
}

function onlyDefaultTagsParam(value: string | null | undefined, hasDefaultTags: boolean): boolean {
  // Ausente = o padrão do modal: ligado quando há tags padrão.
  if (value === undefined || value === null || value === "") return hasDefaultTags;
  if (value === "true") return true;
  if (value === "false") return false;
  throw new DomainError("onlyDefaultTags deve ser 'true' ou 'false'");
}

export const listClockifyEntries: LocalApiHandler = async (deps, params) => {
  const source = deps.entries.clockify();
  assertConfigured(source);
  const { from, to } = periodRange(deps, params);
  const filter = {
    onlyDefaultTags: onlyDefaultTagsParam(params.onlyDefaultTags, source.defaultTagIds.length > 0),
    defaultTagIds: source.defaultTagIds,
  };
  const entries = await source.api.listTimeEntries(
    source.workspaceId,
    source.userId,
    startOfDayISO(from),
    endOfDayISO(to)
  );
  const visible = visibleClockifyEntries(entries, filter);
  return {
    status: 200,
    body: {
      integration: "clockify",
      clockifyWorkspace: { id: source.workspaceId, name: source.workspaceName || null },
      from,
      to,
      onlyDefaultTags: filter.onlyDefaultTags && filter.defaultTagIds.length > 0,
      defaultTagIds: source.defaultTagIds,
      hiddenByTags: clockifyEntriesHiddenByTags(entries, visible, filter),
      days: groupClockifyEntriesByDay(visible).map((group) => ({
        date: group.dateISO,
        totalSeconds: group.totalSeconds,
        entries: group.entries.map(clockifyEntryDto),
      })),
    },
  };
};

function mondayWindowParam(value: string | null | undefined): MondayEntriesWindow {
  if (value === undefined || value === null || value === "") return "7days";
  if ((MONDAY_ENTRIES_WINDOWS as readonly string[]).includes(value)) {
    return value as MondayEntriesWindow;
  }
  throw new DomainError(
    `period deve ser ${MONDAY_ENTRIES_WINDOWS.map((w) => `'${w}'`).join(", ")}`
  );
}

function mondayEntryDto(entry: MondayEntry) {
  return {
    boardId: entry.boardId,
    boardName: entry.boardName,
    itemId: entry.itemId,
    name: entry.name,
    url: entry.url,
    hours: entry.hoursDecimal,
    billable: entry.billable,
    activityType: entry.activityTypeLabel || null,
    projectStage: entry.projectStageLabel || null,
    status: entry.statusLabel || null,
    period: entry.period
      ? { startDate: entry.period.startDayISO, endDate: entry.period.endDayISO }
      : null,
  };
}

export const listMondayEntries: LocalApiHandler = async (deps, params) => {
  const window = mondayWindowParam(params.period);
  const source = deps.entries.monday();
  assertConfigured(source);
  const today = deps.todayISO();
  const range = mondayEntriesWindow(window, today);
  const all = await loadMondayEntries(source.api, source.mappings, source.userId, today);
  const entries = mondayEntriesInRange(all, range);
  return {
    status: 200,
    body: {
      integration: "monday",
      period: window,
      from: range.start,
      to: range.end,
      boardCount: source.mappings.length,
      totalHours: entries.reduce((sum, e) => sum + e.hoursDecimal, 0),
      days: groupMondayEntriesByDay(entries).map((group) => ({
        date: group.dayISO || null,
        totalHours: group.totalHours,
        entries: group.entries.map(mondayEntryDto),
      })),
    },
  };
};
