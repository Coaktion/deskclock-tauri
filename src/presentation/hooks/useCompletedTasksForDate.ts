import type { Task } from "@domain/entities/Task";
import { getTasksForDate } from "@domain/usecases/tasks/GetTasksForDate";
import { updateTaskGroup } from "@domain/usecases/tasks/UpdateTaskGroup";
import { groupTasks, type TaskGroup } from "@domain/utils/groupTasks";
import { useRepositories } from "@presentation/contexts/RepositoriesContext";
import { useActiveWorkspaceId } from "@presentation/contexts/WorkspaceContext";
import { OVERLAY_EVENTS } from "@shared/types/overlayEvents";
import { notifyTasksChanged } from "@shared/utils/taskSync";
import { listen } from "@tauri-apps/api/event";
import { useCallback, useEffect, useState } from "react";

type TaskGroupUpdates = Parameters<typeof updateTaskGroup>[2];

/**
 * Tarefas concluídas (status "completed") do dia, agrupadas por nome+projeto+categoria.
 * Recarrega ao montar e sempre que o estado de execução muda (tarefa iniciada/parada),
 * para refletir uma nova tarefa concluída assim que ela é registrada.
 */
export function useCompletedTasksForDate(dateISO: string) {
  const { taskRepo } = useRepositories();
  const workspaceId = useActiveWorkspaceId();
  const [groups, setGroups] = useState<TaskGroup[]>([]);
  const [totalSeconds, setTotalSeconds] = useState(0);

  const reload = useCallback(async () => {
    const tasks = await getTasksForDate(taskRepo, dateISO, workspaceId);
    const completed = tasks.filter((t) => t.status === "completed");
    setGroups(groupTasks(completed));
    setTotalSeconds(completed.reduce((acc, t) => acc + (t.durationSeconds ?? 0), 0));
  }, [taskRepo, dateISO, workspaceId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  useEffect(() => {
    const unlistens = [
      listen(OVERLAY_EVENTS.RUNNING_TASK_CHANGED, () => void reload()),
      listen(OVERLAY_EVENTS.TASK_STOPPED, () => void reload()),
      listen(OVERLAY_EVENTS.TASKS_CHANGED, () => void reload()),
    ];
    return () => {
      unlistens.forEach((u) => u.then((fn) => fn()));
    };
  }, [reload]);

  /**
   * Edita um grupo inteiro e avisa as outras janelas — o mesmo desenho de
   * mutação do `usePlannedTasksBase`: grava, recarrega a própria lista e emite,
   * porque a janela principal e o histórico têm cada um a sua cópia da lista.
   */
  const updateGroup = useCallback(
    async (tasks: Task[], updates: TaskGroupUpdates) => {
      await updateTaskGroup(taskRepo, tasks, updates, new Date().toISOString());
      await reload();
      void notifyTasksChanged();
    },
    [taskRepo, reload]
  );

  return { groups, totalSeconds, reload, updateGroup };
}
