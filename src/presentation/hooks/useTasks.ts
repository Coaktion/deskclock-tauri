import { useState, useEffect, useCallback } from "react";
import type { TaskGroup } from "@domain/utils/groupTasks";
import { getTasksForDate } from "@domain/usecases/tasks/GetTasksForDate";
import { getWeekTotal } from "@domain/usecases/tasks/GetWeekTotal";
import { groupTasks } from "@domain/utils/groupTasks";
import { todayISO, weekBoundsISO } from "@shared/utils/time";
import { OVERLAY_EVENTS } from "@shared/types/overlayEvents";
import { useRunningTask } from "@presentation/hooks/useRunningTask";
import { useRepositories } from "@presentation/contexts/RepositoriesContext";
import { useActiveWorkspaceId } from "@presentation/contexts/WorkspaceContext";
import { listen } from "@tauri-apps/api/event";

interface TaskTotals {
  billableSeconds: number;
  nonBillableSeconds: number;
  weekSeconds: number;
  weekDays: number;
}

export function useTasks() {
  const { taskRepo } = useRepositories();
  const workspaceId = useActiveWorkspaceId();
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
      getTasksForDate(taskRepo, todayISO(), workspaceId),
      getWeekTotal(taskRepo, start, end),
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
  }, [taskRepo, workspaceId]);

  useEffect(() => {
    load();
  }, [load, reloadSignal, today]);

  // Recarrega quando tarefas mudam em qualquer janela (delete/edit/merge/etc.)
  useEffect(() => {
    const unlisten = listen(OVERLAY_EVENTS.TASKS_CHANGED, () => load());
    return () => {
      unlisten.then((fn) => fn());
    };
  }, [load]);

  return { groups, totals, reload: load };
}
