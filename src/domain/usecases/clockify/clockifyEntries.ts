import type { ClockifyTimeEntryFull } from "@shared/types/clockify";
import { localDateISO } from "@shared/utils/time";

// A lista de "Apontamentos do Clockify" como o modal a mostra, fora dele para a
// API local ler o mesmo recorte (`docs-internal/specs/mcp.md` §7, Fase D2).

/** "Cliente - Projeto", como o Clockify exibe o projeto que tem cliente. */
export function projectDisplayName(p: { name: string; clientName?: string | null }): string {
  return p.clientName ? `${p.clientName} - ${p.name}` : p.name;
}

/** Apontamento em andamento (sem fim) conta zero. */
export function clockifyEntryDurationSeconds(entry: ClockifyTimeEntryFull): number {
  if (!entry.timeInterval.end) return 0;
  return Math.round(
    (new Date(entry.timeInterval.end).getTime() - new Date(entry.timeInterval.start).getTime()) /
      1000
  );
}

export interface ClockifyEntriesFilter {
  /** O "Apenas com tags padrão" do modal; só vale com `defaultTagIds` não vazio. */
  onlyDefaultTags: boolean;
  defaultTagIds: string[];
}

/**
 * O que a lista mostra: sem o apontamento em andamento e, com o filtro ligado,
 * só os que têm **todas** as tags padrão.
 */
export function visibleClockifyEntries(
  entries: ClockifyTimeEntryFull[],
  { onlyDefaultTags, defaultTagIds }: ClockifyEntriesFilter
): ClockifyTimeEntryFull[] {
  let list = entries.filter((e) => e.timeInterval.end !== null);
  if (onlyDefaultTags && defaultTagIds.length > 0) {
    list = list.filter((e) => defaultTagIds.every((id) => e.tagIds.includes(id)));
  }
  return list;
}

/**
 * Havia apontamentos concluídos, mas o filtro de tags escondeu todos — o estado
 * em que o modal oferece "Mostrar todos".
 */
export function clockifyEntriesHiddenByTags(
  entries: ClockifyTimeEntryFull[],
  visible: ClockifyTimeEntryFull[],
  { onlyDefaultTags, defaultTagIds }: ClockifyEntriesFilter
): boolean {
  return (
    onlyDefaultTags &&
    defaultTagIds.length > 0 &&
    visible.length === 0 &&
    entries.some((e) => e.timeInterval.end !== null)
  );
}

export interface ClockifyDayGroup {
  dateISO: string;
  entries: ClockifyTimeEntryFull[];
  totalSeconds: number;
}

/** Por dia local do início, do mais recente para o mais antigo; no dia, do mais recente. */
export function groupClockifyEntriesByDay(entries: ClockifyTimeEntryFull[]): ClockifyDayGroup[] {
  const map = new Map<string, ClockifyTimeEntryFull[]>();
  for (const e of entries) {
    const date = localDateISO(e.timeInterval.start);
    const list = map.get(date) ?? [];
    list.push(e);
    map.set(date, list);
  }
  return [...map.entries()]
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([dateISO, list]) => ({
      dateISO,
      entries: list.sort(
        (a, b) =>
          new Date(b.timeInterval.start).getTime() - new Date(a.timeInterval.start).getTime()
      ),
      totalSeconds: list.reduce((s, e) => s + clockifyEntryDurationSeconds(e), 0),
    }));
}
