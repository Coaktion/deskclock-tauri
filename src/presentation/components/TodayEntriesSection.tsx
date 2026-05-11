import { useEffect, useState } from "react";
import type { Task } from "@domain/entities/Task";
import type { Project } from "@domain/entities/Project";
import type { Category } from "@domain/entities/Category";
import type { TaskGroup } from "@domain/utils/groupTasks";
import { TaskGroupCard } from "./TaskGroupCard";
import { EditTaskModal } from "@presentation/modals/EditTaskModal";
import { EditGroupModal } from "@presentation/modals/EditGroupModal";
import { useRepositories } from "@presentation/contexts/RepositoriesContext";
import { deleteTask } from "@domain/usecases/tasks/DeleteTask";
import { updateTask } from "@domain/usecases/tasks/UpdateTask";
import { mergeTaskGroup } from "@domain/usecases/tasks/MergeTaskGroup";
import { useRunningTask } from "@presentation/hooks/useRunningTask";
import { formatHHMMSS, startOfDayISO, endOfDayISO, todayISO } from "@shared/utils/time";


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
  const { taskRepo, taskLogRepo } = useRepositories();
  const { startTask, runningTask } = useRunningTask();
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [editingGroup, setEditingGroup] = useState<TaskGroup | null>(null);
  const [sentIds, setSentIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    const today = todayISO();
    taskLogRepo
      .findSentIds("google_sheets", startOfDayISO(today), endOfDayISO(today))
      .then((ids) => setSentIds(new Set(ids)))
      .catch(() => {});
  }, [taskLogRepo, groups]);

  async function handlePlay(task: Task) {
    await startTask({
      name: task.name,
      projectId: task.projectId,
      categoryId: task.categoryId,
      billable: task.billable,
    });
  }

  async function handleDelete(task: Task) {
    await deleteTask(taskRepo, task.id);
    reload();
  }

  async function handleToggleBillable(task: Task) {
    await updateTask(taskRepo, task.id, { billable: !task.billable }, new Date().toISOString());
    reload();
  }

  async function handleMerge(group: TaskGroup) {
    await mergeTaskGroup(taskRepo, group.tasks, new Date().toISOString());
    reload();
  }

  async function handleSaveGroup(
    group: TaskGroup,
    updates: { name: string | null; projectId: string | null; categoryId: string | null; billable: boolean }
  ) {
    const nowISO = new Date().toISOString();
    await Promise.all(group.tasks.map((t) => updateTask(taskRepo, t.id, updates, nowISO)));
    reload();
  }

  return (
    <section>
      <div className="flex items-center justify-between mb-2">
        <h2 className="text-sm font-semibold text-gray-300">Entradas de hoje</h2>
        <span className="text-xs font-mono tabular-nums text-gray-500">
          {formatHHMMSS(totalSeconds)}
        </span>
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
              onEditGroup={setEditingGroup}
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

      {editingGroup && (
        <EditGroupModal
          group={editingGroup}
          projects={projects}
          categories={categories}
          onSave={(updates) => handleSaveGroup(editingGroup, updates)}
          onClose={() => setEditingGroup(null)}
        />
      )}
    </section>
  );
}
