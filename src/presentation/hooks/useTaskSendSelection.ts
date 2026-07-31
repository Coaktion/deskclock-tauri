import { useEffect, useMemo, useRef, useState } from "react";
import type { Task } from "@domain/entities/Task";
import type { TaskGroup } from "@domain/utils/groupTasks";
import type { TaskValidationResult } from "@domain/integrations/taskValidation";
import { groupTasks } from "@domain/utils/groupTasks";
import { useRepositories } from "@presentation/contexts/RepositoriesContext";
import {
  todayISO,
  addDaysISO,
  startOfDayISO,
  endOfDayISO,
  startOfMonthISO,
  localDateISO,
} from "@shared/utils/time";

export type QuickPeriod = "today" | "yesterday" | "week" | "month" | "custom";

export interface DayGroup {
  date: string;
  groups: TaskGroup[];
}

export function formatDayLabel(isoDate: string): string {
  const d = new Date(isoDate + "T12:00:00");
  const weekday = d.toLocaleDateString("pt-BR", { weekday: "short" });
  const datePart = d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
  return `${weekday}, ${datePart}`;
}

export function groupTasksByDay(tasks: Task[]): DayGroup[] {
  const byDate = new Map<string, Task[]>();
  for (const task of tasks) {
    const date = localDateISO(task.startTime);
    const list = byDate.get(date) ?? [];
    list.push(task);
    byDate.set(date, list);
  }
  return [...byDate.entries()]
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([date, dayTasks]) => ({ date, groups: groupTasks(dayTasks) }));
}

export function selKey(date: string, groupKey: string): string {
  return `${date}\0${groupKey}`;
}

export function quickToRange(
  quick: QuickPeriod,
  customStart: string,
  customEnd: string
): { start: string; end: string } {
  const today = todayISO();
  switch (quick) {
    case "today":
      return { start: today, end: today };
    case "yesterday": {
      const y = addDaysISO(today, -1);
      return { start: y, end: y };
    }
    case "week":
      return { start: addDaysISO(today, -6), end: today };
    case "month":
      return { start: startOfMonthISO(), end: today };
    case "custom":
      return { start: customStart, end: customEnd };
  }
}

export interface UseTaskSendSelectionResult {
  quick: QuickPeriod;
  setQuick: (q: QuickPeriod) => void;
  customStart: string;
  setCustomStart: (v: string) => void;
  customEnd: string;
  setCustomEnd: (v: string) => void;
  dayGroups: DayGroup[];
  sentIds: Set<string>;
  selectedKeys: Set<string>;
  collapsedDays: Set<string>;
  loaded: boolean;
  loading: boolean;
  message: { text: string; error: boolean } | null;
  setMessage: (m: { text: string; error: boolean } | null) => void;
  reloadKey: number;
  triggerReload: () => void;
  hasSentSelected: boolean;
  toggleGroup: (date: string, key: string, group: TaskGroup) => void;
  toggleDay: (date: string, groups: TaskGroup[]) => void;
  toggleDayCollapse: (date: string) => void;
  selectAll: () => void;
  deselectAll: () => void;
  collectSelectedGroups: () => TaskGroup[];
}

export function useTaskSendSelection(
  integrationId: string,
  validateTask: (task: Task) => TaskValidationResult
): UseTaskSendSelectionResult {
  const { taskRepo, taskLogRepo } = useRepositories();

  const [quick, setQuick] = useState<QuickPeriod>("today");
  const [customStart, setCustomStart] = useState(todayISO());
  const [customEnd, setCustomEnd] = useState(todayISO());
  const [dayGroups, setDayGroups] = useState<DayGroup[]>([]);
  const [sentIds, setSentIds] = useState<Set<string>>(new Set());
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());
  const [collapsedDays, setCollapsedDays] = useState<Set<string>>(new Set());
  const [loaded, setLoaded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ text: string; error: boolean } | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  const customStartRef = useRef(customStart);
  const customEndRef = useRef(customEnd);
  useEffect(() => {
    customStartRef.current = customStart;
  }, [customStart]);
  useEffect(() => {
    customEndRef.current = customEnd;
  }, [customEnd]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setMessage(null);

    async function run() {
      try {
        const { start, end } = quickToRange(quick, customStartRef.current, customEndRef.current);
        const [tasks, sentIdsArr] = await Promise.all([
          // Sem filtro de workspace de propósito: as integrações são externas ao
          // workspace e enxergam tudo (decisão registrada no spec, item 3).
          taskRepo.findByDateRange(startOfDayISO(start), endOfDayISO(end)),
          taskLogRepo.findSentIds(integrationId, startOfDayISO(start), endOfDayISO(end)),
        ]);
        if (cancelled) return;

        const completed = tasks.filter((t) => t.status === "completed");
        const newSentIds = new Set(sentIdsArr);
        const dg = groupTasksByDay(completed);

        const keys = new Set<string>();
        for (const { date, groups } of dg) {
          for (const g of groups) {
            if (validateTask(g.tasks[0]).ok && !g.tasks.every((t) => newSentIds.has(t.id))) {
              keys.add(selKey(date, g.key));
            }
          }
        }

        setDayGroups(dg);
        setSentIds(newSentIds);
        setSelectedKeys(keys);
        setCollapsedDays(new Set());
        setLoaded(true);
      } catch (err) {
        if (!cancelled) {
          const msg =
            err instanceof Error
              ? err.message
              : typeof err === "string"
                ? err
                : "Erro ao carregar tarefas.";
          setMessage({ text: msg, error: true });
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void run();
    return () => {
      cancelled = true;
    };
    // integrationId e validateTask são estáveis por contrato do chamador
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [taskRepo, taskLogRepo, quick, reloadKey]);

  function toggleGroup(date: string, key: string, group: TaskGroup) {
    if (!validateTask(group.tasks[0]).ok) return;
    const sk = selKey(date, key);
    setSelectedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(sk)) next.delete(sk);
      else next.add(sk);
      return next;
    });
  }

  function toggleDay(date: string, groups: TaskGroup[]) {
    const validGroups = groups.filter((g) => validateTask(g.tasks[0]).ok);
    const dayKeys = validGroups.map((g) => selKey(date, g.key));
    if (dayKeys.length === 0) return;
    const allSelected = dayKeys.every((k) => selectedKeys.has(k));
    setSelectedKeys((prev) => {
      const next = new Set(prev);
      if (allSelected) dayKeys.forEach((k) => next.delete(k));
      else dayKeys.forEach((k) => next.add(k));
      return next;
    });
  }

  function toggleDayCollapse(date: string) {
    setCollapsedDays((prev) => {
      const next = new Set(prev);
      if (next.has(date)) next.delete(date);
      else next.add(date);
      return next;
    });
  }

  function selectAll() {
    const keys = new Set<string>();
    for (const { date, groups } of dayGroups) {
      for (const g of groups) {
        if (validateTask(g.tasks[0]).ok) keys.add(selKey(date, g.key));
      }
    }
    setSelectedKeys(keys);
  }

  function deselectAll() {
    setSelectedKeys(new Set());
  }

  function collectSelectedGroups(): TaskGroup[] {
    const result: TaskGroup[] = [];
    for (const { date, groups } of dayGroups) {
      for (const g of groups) {
        if (selectedKeys.has(selKey(date, g.key))) result.push(g);
      }
    }
    return result;
  }

  const hasSentSelected = useMemo(() => {
    if (selectedKeys.size === 0) return false;
    for (const { date, groups } of dayGroups) {
      for (const g of groups) {
        if (selectedKeys.has(selKey(date, g.key)) && g.tasks.every((t) => sentIds.has(t.id))) {
          return true;
        }
      }
    }
    return false;
  }, [selectedKeys, dayGroups, sentIds]);

  return {
    quick,
    setQuick,
    customStart,
    setCustomStart,
    customEnd,
    setCustomEnd,
    dayGroups,
    sentIds,
    selectedKeys,
    collapsedDays,
    loaded,
    loading,
    message,
    setMessage,
    reloadKey,
    triggerReload: () => setReloadKey((k) => k + 1),
    hasSentSelected,
    toggleGroup,
    toggleDay,
    toggleDayCollapse,
    selectAll,
    deselectAll,
    collectSelectedGroups,
  };
}
