import type { IMondayApi } from "@domain/integrations/IMondayApi";
import { listItemsOwnedBy } from "@domain/usecases/monday/listItemsOwnedBy";
import {
  findColumnValue,
  parseDatePairPeriod,
  periodOverlaps,
  searchFloorDayISO,
  type MondayItemPeriod,
} from "@domain/usecases/monday/mondayItemPeriod";
import type { MondayItem } from "@shared/types/monday";
import type { MondayProjectMapping } from "@shared/types/mondayConfig";
import { addDaysISO } from "@shared/utils/time";

// "Atividades no Monday" como o modal as busca e as mostra, fora do hook para a
// API local ler o mesmo recorte (`docs-internal/specs/mcp.md` §7, Fase D2). O
// porquê da busca sem data, do piso e de só as do usuário está no
// `useMondayEntries`.

export interface MondayEntry {
  boardId: string;
  boardName: string;
  itemId: string;
  name: string;
  url: string;
  hoursDecimal: number;
  billable: boolean;
  activityTypeLabel: string;
  projectStageLabel: string;
  statusLabel: string;
  period: MondayItemPeriod | null;
  /** Rótulos aceitos pelas colunas deste board, para os selects da edição. */
  mapping: MondayProjectMapping;
}

function columnText(item: MondayItem, columnId: string | undefined): string {
  return findColumnValue(item, columnId)?.text?.trim() ?? "";
}

function columnNumber(item: MondayItem, columnId: string | undefined): number {
  const raw = columnText(item, columnId);
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : 0;
}

function unique(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))];
}

/** Colunas que a listagem e a edição leem — o resto do board não vem no payload. */
function wantedColumns(mapping: MondayProjectMapping): string[] {
  const { columnIds } = mapping;
  return [
    columnIds.reportedHours,
    columnIds.activityType,
    columnIds.person,
    ...(columnIds.billingType ? [columnIds.billingType] : []),
    ...(columnIds.status ? [columnIds.status] : []),
    ...(columnIds.projectStage ? [columnIds.projectStage] : []),
    ...(columnIds.startDate ? [columnIds.startDate] : []),
    ...(columnIds.endDate ? [columnIds.endDate] : []),
  ];
}

function toEntry(item: MondayItem, mapping: MondayProjectMapping): MondayEntry {
  const { columnIds } = mapping;
  return {
    boardId: mapping.mondayBoardId,
    boardName: mapping.mondayBoardName,
    itemId: item.id,
    name: item.name,
    url: item.url,
    hoursDecimal: columnNumber(item, columnIds.reportedHours),
    billable: columnText(item, columnIds.billingType) === "Billable",
    activityTypeLabel: columnText(item, columnIds.activityType),
    projectStageLabel: columnText(item, columnIds.projectStage),
    statusLabel: columnText(item, columnIds.status),
    period: parseDatePairPeriod(
      findColumnValue(item, columnIds.startDate),
      findColumnValue(item, columnIds.endDate)
    ),
    mapping,
  };
}

/**
 * As atividades do usuário nos boards vinculados, desde o piso de busca. Uma
 * busca serve as quatro janelas: quem recorta é `mondayEntriesInRange`.
 */
export async function loadMondayEntries(
  api: IMondayApi,
  mappings: MondayProjectMapping[],
  userId: string,
  todayISO: string
): Promise<MondayEntry[]> {
  const byBoard = new Map(mappings.map((m) => [m.mondayBoardId, m]));
  const items = await listItemsOwnedBy(api, mappings, userId, {
    scope: "activities",
    columnIds: unique(mappings.flatMap(wantedColumns)),
    endsOnOrAfterDay: searchFloorDayISO(todayISO),
  });
  return items.flatMap((item) => {
    const mapping = byBoard.get(item.boardId);
    return mapping ? [toEntry(item, mapping)] : [];
  });
}

export function mondayEntriesInRange(
  entries: MondayEntry[],
  range: { start: string; end: string }
): MondayEntry[] {
  return entries.filter((e) => periodOverlaps(e.period, range.start, range.end));
}

/** As janelas do modal. Não há personalizado: a busca não filtra por data. */
export type MondayEntriesWindow = "today" | "7days" | "30days" | "month";

export const MONDAY_ENTRIES_WINDOWS: readonly MondayEntriesWindow[] = [
  "today",
  "7days",
  "30days",
  "month",
];

export function mondayEntriesWindow(
  window: MondayEntriesWindow,
  todayISO: string
): { start: string; end: string } {
  switch (window) {
    case "today":
      return { start: todayISO, end: todayISO };
    case "7days":
      return { start: addDaysISO(todayISO, -6), end: todayISO };
    case "30days":
      return { start: addDaysISO(todayISO, -29), end: todayISO };
    case "month":
      return { start: `${todayISO.slice(0, 7)}-01`, end: todayISO };
  }
}

export interface MondayDayGroup {
  /** Dia de início; `""` para a atividade sem data. */
  dayISO: string;
  entries: MondayEntry[];
  totalHours: number;
}

/** Agrupa pelo dia de início; um item que cruza dias aparece uma vez, no começo. */
export function groupMondayEntriesByDay(entries: MondayEntry[]): MondayDayGroup[] {
  const map = new Map<string, MondayEntry[]>();
  for (const entry of entries) {
    const day = entry.period?.startDayISO ?? "";
    map.set(day, [...(map.get(day) ?? []), entry]);
  }
  return [...map.entries()]
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([dayISO, list]) => ({
      dayISO,
      entries: list,
      totalHours: list.reduce((sum, e) => sum + e.hoursDecimal, 0),
    }));
}
