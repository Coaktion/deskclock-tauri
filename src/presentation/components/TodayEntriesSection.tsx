import { useEffect, useState } from "react";
import type { Task } from "@domain/entities/Task";
import type { Project } from "@domain/entities/Project";
import type { Category } from "@domain/entities/Category";
import type { CustomValues } from "@domain/entities/CustomField";
import type { TaskGroup } from "@domain/utils/groupTasks";
import { TaskGroupCard } from "./TaskGroupCard";
import { EditTaskModal } from "@presentation/modals/EditTaskModal";
import { EditGroupModal } from "@presentation/modals/EditGroupModal";
import { MoveToWorkspaceModal } from "@presentation/modals/MoveToWorkspaceModal";
import { SectionCard } from "@presentation/components/ui";
import { useWorkspaces } from "@presentation/contexts/WorkspaceContext";
import { useRepositories } from "@presentation/contexts/RepositoriesContext";
import { deleteTask } from "@domain/usecases/tasks/DeleteTask";
import { updateTask } from "@domain/usecases/tasks/UpdateTask";
import { mergeTaskGroup } from "@domain/usecases/tasks/MergeTaskGroup";
import { useRunningTask } from "@presentation/hooks/useRunningTask";
import { formatHHMMSS, startOfDayISO, endOfDayISO, todayISO } from "@shared/utils/time";
import { notifyTasksChanged } from "@shared/utils/taskSync";

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
  const [movingTasks, setMovingTasks] = useState<Task[] | null>(null);
  const { workspaces } = useWorkspaces();
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
      // A origem viaja com a cópia: sem ela, parar a nova execução deixaria a
      // planejada pendente no planejamento, porque não haveria qual concluir (§4.1).
      plannedTaskId: task.plannedTaskId ?? null,
      customValues: task.customValues,
    });
  }

  async function handleDelete(task: Task) {
    await deleteTask(taskRepo, task.id);
    void notifyTasksChanged();
    reload();
  }

  async function handleToggleBillable(task: Task) {
    await updateTask(taskRepo, task.id, { billable: !task.billable }, new Date().toISOString());
    void notifyTasksChanged();
    reload();
  }

  async function handleMerge(group: TaskGroup) {
    await mergeTaskGroup(taskRepo, group.tasks, new Date().toISOString());
    void notifyTasksChanged();
    reload();
  }

  async function handleSaveGroup(
    group: TaskGroup,
    updates: {
      name: string | null;
      projectId: string | null;
      categoryId: string | null;
      billable: boolean;
      customValues: CustomValues;
    }
  ) {
    const nowISO = new Date().toISOString();
    await Promise.all(group.tasks.map((t) => updateTask(taskRepo, t.id, updates, nowISO)));
    void notifyTasksChanged();
    reload();
  }

  return (
    <SectionCard
      title="Entradas de hoje"
      action={
        <span className="font-mono tabular-nums text-fg-secondary">
          {formatHHMMSS(totalSeconds)}
        </span>
      }
    >
      {groups.length === 0 ? (
        <p className="text-sm text-fg-muted text-center py-6">Nenhuma entrada hoje.</p>
      ) : (
        <div>
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
              onMoveToWorkspace={workspaces.length > 1 ? setMovingTasks : undefined}
              onToggleBillable={handleToggleBillable}
            />
          ))}
        </div>
      )}

      {movingTasks && (
        <MoveToWorkspaceModal
          tasks={movingTasks}
          projects={projects}
          categories={categories}
          onMoved={reload}
          onClose={() => setMovingTasks(null)}
        />
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
    </SectionCard>
  );
}
