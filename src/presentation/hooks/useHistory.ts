import { useState, useCallback } from "react";
import type { Task } from "@domain/entities/Task";
import { TaskRepository } from "@infra/database/TaskRepository";
import { searchTasks } from "@domain/usecases/tasks/SearchTasks";
import { getHistoryTotals, type HistoryTotals } from "@domain/usecases/tasks/GetHistoryTotals";
import { deleteTask } from "@domain/usecases/tasks/DeleteTask";
import {
  todayISO, addDaysISO, startOfMonthISO,
  startOfDayISO, endOfDayISO,
} from "@shared/utils/time";
import type { UUID } from "@shared/types";

const repo = new TaskRepository();

export type QuickFilter = "today" | "7days" | "30days" | "month" | "custom";

export interface HistoryFilters {
  quick: QuickFilter;
  startDate: string;
  endDate: string;
  name: string;
  projectId: UUID | null;
  categoryId: UUID | null;
  billable: "all" | "yes" | "no";
}

export interface DayGroup {
  dateISO: string;
  tasks: Task[];
  totalSeconds: number;
}

function quickToRange(quick: QuickFilter, startDate: string, endDate: string): { start: string; end: string } {
  const today = todayISO();
  switch (quick) {
    case "today":   return { start: today, end: today };
    case "7days":   return { start: addDaysISO(today, -6), end: today };
    case "30days":  return { start: addDaysISO(today, -29), end: today };
    case "month":   return { start: startOfMonthISO(), end: today };
    case "custom":  return { start: startDate, end: endDate };
  }
}

function groupByDay(tasks: Task[]): DayGroup[] {
  const map = new Map<string, Task[]>();
  for (const t of tasks) {
    const dateISO = t.startTime.slice(0, 10);
    if (!map.has(dateISO)) map.set(dateISO, []);
    map.get(dateISO)!.push(t);
  }
  return Array.from(map.entries())
    .sort(([a], [b]) => b.localeCompare(a)) // mais recente primeiro
    .map(([dateISO, dayTasks]) => ({
      dateISO,
      tasks: dayTasks.sort((a, b) => b.startTime.localeCompare(a.startTime)),
      totalSeconds: dayTasks.reduce((sum, t) => sum + (t.durationSeconds ?? 0), 0),
    }));
}

const INITIAL_FILTERS: HistoryFilters = {
  quick: "today",
  startDate: todayISO(),
  endDate: todayISO(),
  name: "",
  projectId: null,
  categoryId: null,
  billable: "all",
};

export function useHistory() {
  const [filters, setFilters] = useState<HistoryFilters>(INITIAL_FILTERS);
  const [groups, setGroups] = useState<DayGroup[]>([]);
  const [totals, setTotals] = useState<HistoryTotals>({ totalSeconds: 0, billableSeconds: 0, nonBillableSeconds: 0, count: 0 });
  const [searched, setSearched] = useState(false);

  const search = useCallback(async (f: HistoryFilters) => {
    const { start, end } = quickToRange(f.quick, f.startDate, f.endDate);
    const tasks = await searchTasks(repo, {
      startISO: startOfDayISO(start),
      endISO: endOfDayISO(end),
      name: f.name || undefined,
      projectId: f.projectId ?? undefined,
      categoryId: f.categoryId ?? undefined,
      billable: f.billable === "all" ? undefined : f.billable === "yes",
    });
    setGroups(groupByDay(tasks));
    setTotals(getHistoryTotals(tasks));
    setSearched(true);
  }, []);

  const updateFilter = useCallback(<K extends keyof HistoryFilters>(key: K, value: HistoryFilters[K]) => {
    setFilters((prev) => ({ ...prev, [key]: value }));
  }, []);

  const setQuick = useCallback((quick: QuickFilter) => {
    setFilters((prev) => ({ ...prev, quick }));
  }, []);

  const remove = useCallback(async (id: UUID) => {
    await deleteTask(repo, id);
    setGroups((prev) =>
      prev
        .map((g) => ({ ...g, tasks: g.tasks.filter((t) => t.id !== id) }))
        .filter((g) => g.tasks.length > 0)
    );
    setTotals((prev) => {
      const task = groups.flatMap((g) => g.tasks).find((t) => t.id === id);
      if (!task) return prev;
      const s = task.durationSeconds ?? 0;
      return {
        count: prev.count - 1,
        totalSeconds: prev.totalSeconds - s,
        billableSeconds: task.billable ? prev.billableSeconds - s : prev.billableSeconds,
        nonBillableSeconds: !task.billable ? prev.nonBillableSeconds - s : prev.nonBillableSeconds,
      };
    });
  }, [groups]);

  const reload = useCallback(() => search(filters), [search, filters]);

  return { filters, groups, totals, searched, search, updateFilter, setQuick, remove, reload };
}
