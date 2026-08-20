import { Play, Minimize2, X, LayoutList } from "lucide-react";
import { usePlannedTasksForDate } from "@presentation/hooks/usePlannedTasks";
import { useRunningTask } from "@presentation/hooks/useRunningTask";
import { useProjects } from "@presentation/hooks/useProjects";
import { todayISO } from "@shared/utils/time";
import type { PlannedTask } from "@domain/entities/PlannedTask";

interface PlanningOverlayProps {
  onMinimize: () => void;
  onClose: () => void;
  onNavigatePlanning: () => void;
}

export function PlanningOverlay({ onMinimize, onClose, onNavigatePlanning }: PlanningOverlayProps) {
  const today = todayISO();
  const { tasks, reload } = usePlannedTasksForDate(today);
  const { startTask, runningTask } = useRunningTask();
  const { projects } = useProjects();

  const pending = tasks.filter((t) => !t.completedDates.includes(today));

  if (runningTask) return null;

  async function handlePlay(task: PlannedTask) {
    await startTask({
      name: task.name,
      projectId: task.projectId,
      categoryId: task.categoryId,
      billable: task.billable,
      plannedTaskId: task.id,
      customValues: task.customValues,
    });
    await reload();
    onClose();
  }

  async function handleNewTask() {
    await startTask({ billable: true });
    onClose();
  }

  return (
    <div className="fixed bottom-4 right-4 z-40 w-72 bg-surface border border-border rounded-card shadow-2xl overflow-hidden">
      {/* Title bar */}
      <div className="flex items-center justify-between px-3 py-2 bg-raised border-b border-border">
        <span className="text-sm font-medium text-fg-secondary">Tarefas de Hoje</span>
        <div className="flex gap-1">
          <button
            onClick={onNavigatePlanning}
            title="Ir para planejamento"
            className="p-1 text-fg-secondary hover:text-fg hover:bg-border rounded-control transition-colors"
          >
            <LayoutList size={14} />
          </button>
          <button
            onClick={onMinimize}
            title="Minimizar"
            className="p-1 text-fg-secondary hover:text-fg hover:bg-border rounded-control transition-colors"
          >
            <Minimize2 size={14} />
          </button>
          <button
            onClick={onClose}
            title="Fechar"
            className="p-1 text-fg-secondary hover:text-fg hover:bg-border rounded-control transition-colors"
          >
            <X size={14} />
          </button>
        </div>
      </div>

      {/* Lista */}
      <div className="max-h-64 overflow-y-auto">
        {pending.length === 0 ? (
          <p className="text-center text-fg-muted text-xs py-6">Nenhuma tarefa pendente</p>
        ) : (
          pending.map((task) => {
            const project = projects.find((p) => p.id === task.projectId);
            return (
              <div
                key={task.id}
                className="flex items-center gap-2 px-3 py-2 border-b border-border-subtle hover:bg-raised/50 transition-colors"
              >
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-fg truncate">{task.name}</p>
                  {project && <p className="text-xs text-fg-muted truncate">{project.name}</p>}
                </div>
                <button
                  onClick={() => handlePlay(task)}
                  className="p-1 text-fg-secondary hover:text-billable hover:bg-billable/10 rounded-control transition-colors shrink-0"
                >
                  <Play size={14} />
                </button>
              </div>
            );
          })
        )}
      </div>

      {/* Botão nova tarefa */}
      <div className="p-2 border-t border-border">
        <button
          onClick={handleNewTask}
          className="w-full py-1.5 text-sm text-fg-secondary hover:text-fg bg-raised hover:bg-border rounded-control transition-colors"
        >
          + Nova tarefa
        </button>
      </div>
    </div>
  );
}
