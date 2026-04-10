import { useEffect } from "react";
import { Play, Minimize2, X, LayoutList } from "lucide-react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { LogicalSize } from "@tauri-apps/api/dpi";
import type { Task } from "@domain/entities/Task";
import type { PlannedTask } from "@domain/entities/PlannedTask";
import { usePlannedTasksForDate } from "@presentation/hooks/usePlannedTasks";
import { useProjects } from "@presentation/hooks/useProjects";
import { todayISO } from "@shared/utils/time";
import { executeActions } from "@shared/utils/actions";
import { openInBrowser, openInFileManager } from "@shared/utils/shell";

const OVERLAY_WIDTH = 288;
const HEADER_H = 37;
const NEW_TASK_H = 45;
const FOOTER_H = NEW_TASK_H;
const ROW_H = 42;
const EMPTY_H = 60;
const MAX_VISIBLE_ROWS = 6;

interface PlanningOverlayContentProps {
  onMinimize: () => void;
  onClose: () => void;
  onNavigatePlanning: () => void;
  onStartTask: (input: {
    name?: string | null;
    projectId?: string | null;
    categoryId?: string | null;
    billable: boolean;
  }) => Promise<void>;
  onTaskStarted: (task: Task) => void;
}

export function PlanningOverlayContent({
  onMinimize,
  onClose,
  onNavigatePlanning,
  onStartTask,
}: PlanningOverlayContentProps) {
  const today = todayISO();
  const { tasks, reload } = usePlannedTasksForDate(today);
  const { projects } = useProjects();

  const pending = tasks.filter((t) => !t.completedDates.includes(today));

  // Redimensiona a janela para caber exatamente o número de tarefas
  useEffect(() => {
    const contentH =
      pending.length === 0 ? EMPTY_H : Math.min(pending.length, MAX_VISIBLE_ROWS) * ROW_H;
    const totalH = HEADER_H + contentH + FOOTER_H;
    getCurrentWindow()
      .setSize(new LogicalSize(OVERLAY_WIDTH, totalH))
      .catch(() => {});
  }, [pending.length]);

  async function handlePlay(task: PlannedTask) {
    await onStartTask({
      name: task.name,
      projectId: task.projectId,
      categoryId: task.categoryId,
      billable: task.billable,
    });
    await executeActions(task.actions, { openUrl: openInBrowser, openPath: openInFileManager });
    await reload();
  }

  return (
    <div className="w-full h-full flex flex-col bg-gray-900 border border-gray-700 rounded-xl shadow-2xl overflow-hidden">
      {/* Title bar — drag handle */}
      <div
        data-tauri-drag-region
        className="flex items-center justify-between px-3 py-2 bg-gray-800 border-b border-gray-700 cursor-move select-none shrink-0"
      >
        <span className="text-xs font-medium text-gray-300 pointer-events-none">
          Tarefas de Hoje
        </span>
        <div className="flex gap-1">
          <button
            onClick={onNavigatePlanning}
            title="Ir para planejamento"
            className="p-1 text-gray-400 hover:text-gray-200 hover:bg-gray-700 rounded transition-colors"
          >
            <LayoutList size={13} />
          </button>
          <button
            onClick={onMinimize}
            title="Minimizar"
            className="p-1 text-gray-400 hover:text-gray-200 hover:bg-gray-700 rounded transition-colors"
          >
            <Minimize2 size={13} />
          </button>
          <button
            onClick={onClose}
            title="Fechar"
            className="p-1 text-gray-400 hover:text-gray-200 hover:bg-gray-700 rounded transition-colors"
          >
            <X size={13} />
          </button>
        </div>
      </div>

      {/* Nova tarefa — no topo, antes da lista */}
      <div className="p-2 border-b border-gray-700 shrink-0">
        <button
          onClick={() => onStartTask({ billable: true })}
          className="w-full py-1.5 text-xs text-gray-300 hover:text-white bg-gray-800 hover:bg-gray-700 rounded transition-colors"
        >
          + Nova tarefa
        </button>
      </div>

      {/* Lista de tarefas */}
      <div className="flex-1 overflow-y-auto">
        {pending.length === 0 ? (
          <p className="text-center text-gray-500 text-xs py-6">Nenhuma tarefa pendente</p>
        ) : (
          pending.map((task) => {
            const project = projects.find((p) => p.id === task.projectId);
            return (
              <div
                key={task.id}
                className="flex items-center gap-2 px-3 py-2 border-b border-gray-800 hover:bg-gray-800/50 transition-colors"
              >
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-gray-200 truncate">{task.name}</p>
                  {project && <p className="text-xs text-gray-500 truncate">{project.name}</p>}
                </div>
                <button
                  onClick={() => handlePlay(task)}
                  className="p-1 text-gray-400 hover:text-green-400 hover:bg-green-900/20 rounded transition-colors shrink-0"
                >
                  <Play size={12} />
                </button>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
