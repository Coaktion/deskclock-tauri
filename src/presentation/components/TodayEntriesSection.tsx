import { useEffect, useState } from "react";
import type { Task } from "@domain/entities/Task";
import type { Project } from "@domain/entities/Project";
import type { Category } from "@domain/entities/Category";
import type { TaskGroup } from "@shared/utils/groupTasks";
import { TaskGroupCard } from "./TaskGroupCard";
import { EditTaskModal } from "@presentation/modals/EditTaskModal";
import { TaskRepository } from "@infra/database/TaskRepository";
import { TaskIntegrationLogRepository } from "@infra/database/TaskIntegrationLogRepository";
import { deleteTask } from "@domain/usecases/tasks/DeleteTask";
import { updateTask } from "@domain/usecases/tasks/UpdateTask";
import { mergeTaskGroup } from "@domain/usecases/tasks/MergeTaskGroup";
import { useRunningTask } from "@presentation/contexts/RunningTaskContext";
import { formatHHMMSS, startOfDayISO, endOfDayISO, todayISO } from "@shared/utils/time";

const repo = new TaskRepository();
const logRepo = new TaskIntegrationLogRepository();

interface TodayEntriesSectionProps {
  groups: TaskGroup[];
  projects: Project[];
  categories: Category[];
  reload: () => void;
  totalSeconds: number;
}

export function TodayEntriesSection({
  groups,
  projects,
  categories,
  reload,
  totalSeconds,
}: TodayEntriesSectionProps) {
  const { startTask, runningTask } = useRunningTask();
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [sentIds, setSentIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    const today = todayISO();
    logRepo
      .findSentIds("google_sheets", startOfDayISO(today), endOfDayISO(today))
      .then((ids) => setSentIds(new Set(ids)))
      .catch(() => {});
  }, [groups]);

  async function handlePlay(task: Task) {
    await startTask({
      name: task.name,
      projectId: task.projectId,
      categoryId: task.categoryId,
      billable: task.billable,
    });
  }

  async function handleDelete(task: Task) {
    await deleteTask(repo, task.id);
    reload();
  }

  async function handleToggleBillable(task: Task) {
    await updateTask(repo, task.id, { billable: !task.billable }, new Date().toISOString());
    reload();
  }

  async function handleMerge(group: TaskGroup) {
    await mergeTaskGroup(repo, group.tasks, new Date().toISOString());
    reload();
  }

  return (
    <section>
      <div className="flex items-center justify-between mb-2">
        <h2 className="text-sm font-semibold text-gray-300">Entradas de hoje</h2>
        <span className="text-xs font-mono tabular-nums text-gray-500">{formatHHMMSS(totalSeconds)}</span>
      </div>

      {groups.length === 0 ? (
        <p className="text-sm text-gray-600 text-center py-6">Nenhuma entrada hoje.</p>
      ) : (
        <div className="space-y-2">
          {groups.map((g) => (
            <TaskGroupCard
              key={g.key}
              group={g}
              projects={projects}
              categories={categories}
              sentIds={sentIds}
              playDisabled={!!runningTask}
              onPlay={handlePlay}
              onEdit={setEditingTask}
              onDelete={handleDelete}
              onMerge={handleMerge}
              onToggleBillable={handleToggleBillable}
            />
          ))}
        </div>
      )}

      {editingTask && (
        <EditTaskModal
          task={editingTask}
          projects={projects}
          categories={categories}
          onSave={reload}
          onClose={() => setEditingTask(null)}
        />
      )}
    </section>
  );
}
