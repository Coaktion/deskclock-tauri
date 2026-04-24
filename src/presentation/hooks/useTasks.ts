import { useState, useEffect, useCallback } from "react";
import type { TaskGroup } from "@shared/utils/groupTasks";
import { TaskRepository } from "@infra/database/TaskRepository";
import { getTasksForDate } from "@domain/usecases/tasks/GetTasksForDate";
import { getWeekTotal } from "@domain/usecases/tasks/GetWeekTotal";
import { groupTasks } from "@shared/utils/groupTasks";
import { todayISO, weekBoundsISO } from "@shared/utils/time";
import { useRunningTask } from "@presentation/hooks/useRunningTask";

const repo = new TaskRepository();

interface TaskTotals {
  billableSeconds: number;
  nonBillableSeconds: number;
  weekSeconds: number;
  weekDays: number;
}

export function useTasks() {
  const { reloadSignal } = useRunningTask();
  const [today, setToday] = useState(todayISO);
  const [groups, setGroups] = useState<TaskGroup[]>([]);
  const [totals, setTotals] = useState<TaskTotals>({
    billableSeconds: 0,
    nonBillableSeconds: 0,
    weekSeconds: 0,
    weekDays: 0,
  });

  // Detecta virada de dia enquanto o app está aberto
  useEffect(() => {
    const interval = setInterval(() => {
      const current = todayISO();
      setToday((prev) => (prev !== current ? current : prev));
    }, 60_000);
    return () => clearInterval(interval);
  }, []);

  const load = useCallback(async () => {
    const { start, end } = weekBoundsISO();
    const [tasks, weekData] = await Promise.all([
      getTasksForDate(repo, todayISO()),
      getWeekTotal(repo, start, end),
    ]);

    const completed = tasks.filter((t) => t.status === "completed");
    setGroups(groupTasks(completed));

    let billable = 0;
    let nonBillable = 0;
    for (const t of completed) {
      const s = t.durationSeconds ?? 0;
      if (t.billable) billable += s;
      else nonBillable += s;
    }
    setTotals({
      billableSeconds: billable,
      nonBillableSeconds: nonBillable,
      weekSeconds: weekData.totalSeconds,
      weekDays: weekData.daysWorked,
    });
  }, []);

  useEffect(() => {
    load();
  }, [load, reloadSignal, today]);

  return { groups, totals, reload: load };
}
