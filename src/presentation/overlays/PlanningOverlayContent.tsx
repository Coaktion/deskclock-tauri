import { useEffect } from "react";
import { Play, Minimize2, X, LayoutList, ArrowRight } from "lucide-react";
import { emit } from "@tauri-apps/api/event";
import type { Task } from "@domain/entities/Task";
import type { PlannedTask } from "@domain/entities/PlannedTask";
import { usePlannedTasksForDate } from "@presentation/hooks/usePlannedTasks";
import { useProjects } from "@presentation/hooks/useProjects";
import { useCategories } from "@presentation/hooks/useCategories";
import { todayISO } from "@shared/utils/time";
import { executeActions } from "@shared/utils/actions";
import { openInBrowser, openInFileManager } from "@shared/utils/shell";
import { getProjectColor } from "@shared/utils/projectColor";
import { OVERLAY_EVENTS } from "@shared/types/overlayEvents";
import type { CommandPaletteNavigatePayload } from "@shared/types/overlayEvents";

const OVERLAY_WIDTH = 288;
const HEADER_H = 37;
const NEW_TASK_H = 45;
const SECTION_H = 28;
const ROW_H = 44;
const FOOTER_H = 34;
const EMPTY_H = 52;
const MAX_VISIBLE_ROWS = 4;

interface PlanningOverlayContentProps {
  onMinimize: () => void;
  onClose: () => void;
  onNavigatePlanning: () => void;
  onResize: (width: number, height: number) => void;
  onStartTask: (input: {
    name?: string | null;
    projectId?: string | null;
    categoryId?: string | null;
    billable: boolean;
    plannedTaskId?: string | null;
  }) => Promise<void>;
  onTaskStarted: (task: Task) => void;
  runningTask: Task | null;
}

export function PlanningOverlayContent({
  onMinimize,
  onClose,
  onNavigatePlanning,
  onResize,
  onStartTask,
  runningTask,
}: PlanningOverlayContentProps) {
  const today = todayISO();
  const { tasks, reload } = usePlannedTasksForDate(today);
  const { projects } = useProjects();
  const { categories } = useCategories();

  const pending = tasks.filter((t) => !t.completedDates.includes(today));
  const completedCount = tasks.length - pending.length;

  useEffect(() => {
    const taskAreaH =
      pending.length === 0 ? EMPTY_H : Math.min(pending.length, MAX_VISIBLE_ROWS) * ROW_H;
    onResize(OVERLAY_WIDTH, HEADER_H + NEW_TASK_H + SECTION_H + taskAreaH + FOOTER_H);
  }, [pending.length, onResize]);

  async function handlePlay(task: PlannedTask) {
    if (runningTask) return;
    await executeActions(task.actions, { openUrl: openInBrowser, openPath: openInFileManager });
    await onStartTask({
      name: task.name,
      projectId: task.projectId,
      categoryId: task.categoryId,
      billable: task.billable,
      plannedTaskId: task.id,
    });
    await reload();
  }

  async function handleOpenApp() {
    await emit(OVERLAY_EVENTS.COMMAND_PALETTE_NAVIGATE, {
      page: "tasks",
    } satisfies CommandPaletteNavigatePayload);
  }

  return (
    <div className="w-full h-full flex flex-col bg-gray-900 border border-gray-700 rounded-xl shadow-2xl overflow-hidden">

      {/* Title bar — drag handle */}
      <div
        data-tauri-drag-region
        className="flex items-center justify-between px-3 bg-gray-800 border-b border-gray-700 cursor-move select-none shrink-0"
        style={{ height: HEADER_H }}
      >
        <span className="text-xs font-medium text-gray-300 pointer-events-none">
          Tarefas de Hoje
        </span>
        <div className="flex gap-1 pointer-events-auto">
          <button
            onClick={onNavigatePlanning}
            title="Ir para planejamento"
            className="p-1 text-gray-400 hover:text-gray-200 hover:bg-gray-700 rounded-lg transition-colors"
          >
            <LayoutList size={13} />
          </button>
          <button
            onClick={onMinimize}
            title="Minimizar"
            className="p-1 text-gray-400 hover:text-gray-200 hover:bg-gray-700 rounded-lg transition-colors"
          >
            <Minimize2 size={13} />
          </button>
          <button
            onClick={onClose}
            title="Fechar"
            className="p-1 text-gray-400 hover:text-gray-200 hover:bg-gray-700 rounded-lg transition-colors"
          >
            <X size={13} />
          </button>
        </div>
      </div>

      {/* Nova tarefa */}
      <div className="p-2 border-b border-gray-700/60 shrink-0" style={{ height: NEW_TASK_H }}>
        <button
          onClick={() => onStartTask({ billable: true })}
          className="w-full h-full flex items-center justify-center gap-1.5 text-xs text-gray-400 hover:text-white bg-gray-800 hover:bg-gray-700/80 rounded-lg transition-colors"
        >
          <Play size={11} fill="currentColor" />
          Nova tarefa
        </button>
      </div>

      {/* Section header */}
      <div
        className="flex items-center px-3 border-b border-gray-800 shrink-0"
        style={{ height: SECTION_H }}
      >
        <span className="text-[10px] font-semibold uppercase tracking-widest text-gray-500">
          Planejadas · {tasks.length}
        </span>
        {tasks.length > 0 && (
          <span className="ml-auto text-[10px] tabular-nums text-gray-600">
            {completedCount}/{tasks.length}
          </span>
        )}
      </div>

      {/* Task list */}
      <div className="flex-1 overflow-y-auto">
        {pending.length === 0 ? (
          <p className="text-center text-gray-600 text-[11px] py-4">Nenhuma tarefa pendente</p>
        ) : (
          pending.map((task) => {
            const project = projects.find((p) => p.id === task.projectId);
            const category = categories.find((c) => c.id === task.categoryId);
            const subtitle = [project?.name, category?.name].filter(Boolean).join(" · ");
            const railColor = getProjectColor(task.projectId);

            return (
              <div
                key={task.id}
                className="relative flex items-center gap-2 px-3 border-b border-gray-800/70 hover:bg-gray-800/40 transition-colors"
                style={{ height: ROW_H }}
              >
                <span
                  className="absolute left-0 top-2.5 bottom-2.5 w-0.5 rounded-r-full"
                  style={{ backgroundColor: railColor }}
                />
                <div className="flex-1 min-w-0 pl-1.5">
                  <p className="text-[12px] font-medium text-gray-200 truncate leading-tight">
                    {task.name}
                  </p>
                  {subtitle && (
                    <p className="text-[10px] text-gray-500 truncate leading-tight mt-0.5">
                      {subtitle}
                    </p>
                  )}
                </div>
                {!runningTask && (
                  <button
                    onClick={() => handlePlay(task)}
                    className="p-1 text-gray-500 hover:text-green-400 hover:bg-green-900/20 rounded-lg transition-colors shrink-0"
                  >
                    <Play size={11} fill="currentColor" />
                  </button>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Footer */}
      <div
        className="flex items-center px-3 border-t border-gray-700/60 shrink-0"
        style={{ height: FOOTER_H }}
      >
        <button
          onClick={handleOpenApp}
          className="ml-auto flex items-center gap-1 text-[11px] text-gray-500 hover:text-gray-300 transition-colors"
        >
          Abrir app
          <ArrowRight size={11} />
        </button>
      </div>
    </div>
  );
}
