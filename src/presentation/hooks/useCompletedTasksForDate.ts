import { getTasksForDate } from "@domain/usecases/tasks/GetTasksForDate";
import { groupTasks, type TaskGroup } from "@domain/utils/groupTasks";
import { useRepositories } from "@presentation/contexts/RepositoriesContext";
import { OVERLAY_EVENTS } from "@shared/types/overlayEvents";
import { listen } from "@tauri-apps/api/event";
import { useCallback, useEffect, useState } from "react";

/**
 * Tarefas concluídas (status "completed") do dia, agrupadas por nome+projeto+categoria.
 * Recarrega ao montar e sempre que o estado de execução muda (tarefa iniciada/parada),
 * para refletir uma nova tarefa concluída assim que ela é registrada.
 */
export function useCompletedTasksForDate(dateISO: string) {
  const { taskRepo } = useRepositories();
  const [groups, setGroups] = useState<TaskGroup[]>([]);
  const [totalSeconds, setTotalSeconds] = useState(0);

  const reload = useCallback(async () => {
    const tasks = await getTasksForDate(taskRepo, dateISO);
    const completed = tasks.filter((t) => t.status === "completed");
    setGroups(groupTasks(completed));
    setTotalSeconds(completed.reduce((acc, t) => acc + (t.durationSeconds ?? 0), 0));
  }, [taskRepo, dateISO]);

  useEffect(() => {
    void reload();
  }, [reload]);

  useEffect(() => {
    const unlistens = [
      listen(OVERLAY_EVENTS.RUNNING_TASK_CHANGED, () => void reload()),
      listen(OVERLAY_EVENTS.TASK_STOPPED, () => void reload()),
    ];
    return () => {
      unlistens.forEach((u) => u.then((fn) => fn()));
    };
  }, [reload]);

  return { groups, totalSeconds, reload };
}
