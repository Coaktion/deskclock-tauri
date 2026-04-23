import { useEffect, useState } from "react";
import { Play, Pause, Square, CheckCircle2, Clock, X, LayoutList, ArrowRight } from "lucide-react";
import { emit } from "@tauri-apps/api/event";
import type { Task } from "@domain/entities/Task";
import type { PlannedTask } from "@domain/entities/PlannedTask";
import { usePlannedTasksForDate } from "@presentation/hooks/usePlannedTasks";
import { useProjects } from "@presentation/hooks/useProjects";
import { useCategories } from "@presentation/hooks/useCategories";
import { useTaskTimer } from "@presentation/hooks/useTaskTimer";
import { todayISO, formatHHMMSS } from "@shared/utils/time";
import { getProjectColor } from "@shared/utils/projectColor";
import { OVERLAY_EVENTS } from "@shared/types/overlayEvents";
import type { CommandPaletteNavigatePayload } from "@shared/types/overlayEvents";

const POPUP_W    = 288;
const HEADER_H   = 37;
const FOOTER_H   = 34;

// Idle state layout
const NEW_TASK_H = 45;
const SECTION_H  = 28;
const ROW_H      = 44;
const EMPTY_H    = 52;
const MAX_ROWS   = 4;

// Running state layout (execution section fills popup body)
const EXEC_H     = 148; // status + name + timer + subtitle + controls + padding

interface PopupOverlayContentProps {
  runningTask: Task | null;
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
  onPlay: (task: PlannedTask) => Promise<void>;
  onPause: () => Promise<void>;
  onResume: () => Promise<void>;
  onStop: (completed: boolean) => Promise<void>;
  onCancel: () => Promise<void>;
}

// ─── Execution section (running mode) ────────────────────────────────────────

interface ExecSectionProps {
  task: Task;
  projectName?: string;
  categoryName?: string;
  onPause: () => Promise<void>;
  onResume: () => Promise<void>;
  onStop: (completed: boolean) => Promise<void>;
  onCancel: () => Promise<void>;
}

function ExecSection({ task, projectName, categoryName, onPause, onResume, onStop, onCancel }: ExecSectionProps) {
  const seconds = useTaskTimer(task);
  const isRunning = task.status === "running";
  const [confirmingStop, setConfirmingStop] = useState(false);
  const subtitle = [projectName, categoryName].filter(Boolean).join(" · ");

  return (
    <div className="flex flex-col flex-1 px-4 py-3 gap-2 min-h-0">
      {/* Status label */}
      <div className="flex items-center gap-1.5">
        <span
          className={`w-1.5 h-1.5 rounded-full shrink-0 ${isRunning ? "animate-pulse" : ""}`}
          style={{ backgroundColor: "#3b82f6" }}
        />
        <span className="text-[9px] font-semibold uppercase tracking-[0.12em] text-blue-400">
          {isRunning ? "Rodando" : "Pausada"}
        </span>
      </div>

      {/* Task name */}
      <p className="text-[13px] font-medium text-gray-100 truncate leading-snug">
        {task.name ?? "(sem nome)"}
      </p>

      {/* Timer — large mono */}
      <p className="font-mono text-[22px] font-semibold tabular-nums text-blue-400 leading-none">
        {formatHHMMSS(seconds)}
      </p>

      {/* Subtitle */}
      {subtitle && (
        <p className="text-[11px] text-gray-500 truncate leading-tight">
          {subtitle}
        </p>
      )}

      {/* Divider */}
      <div className="border-t border-gray-800 mt-auto" />

      {/* Controls */}
      {confirmingStop ? (
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[11px] text-gray-400">Concluída?</span>
          <button
            onClick={() => { setConfirmingStop(false); void onStop(true); }}
            className="flex items-center gap-1 px-2 py-1 text-[11px] bg-green-700/80 hover:bg-green-600 text-white rounded-lg transition-colors"
          >
            <CheckCircle2 size={10} /> Sim
          </button>
          <button
            onClick={() => { setConfirmingStop(false); void onStop(false); }}
            className="flex items-center gap-1 px-2 py-1 text-[11px] bg-gray-700 hover:bg-gray-600 text-gray-200 rounded-lg transition-colors"
          >
            <Clock size={10} /> Não
          </button>
          <button
            onClick={() => setConfirmingStop(false)}
            className="ml-auto p-1 text-gray-500 hover:text-blue-400 rounded-lg transition-colors"
            title="Retomar"
          >
            <Play size={11} />
          </button>
        </div>
      ) : (
        <div className="flex items-center gap-2">
          <button
            onClick={isRunning ? onPause : onResume}
            className="flex items-center gap-1.5 px-3 py-1.5 text-[12px] font-medium text-gray-300 hover:text-gray-100 bg-gray-800 hover:bg-gray-700 rounded-lg transition-colors"
          >
            {isRunning ? <><Pause size={11} /> Pausar</> : <><Play size={11} /> Retomar</>}
          </button>
          <button
            onClick={() => setConfirmingStop(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-[12px] font-medium text-gray-300 hover:text-gray-100 bg-gray-800 hover:bg-gray-700 rounded-lg transition-colors"
          >
            <Square size={11} /> Parar
          </button>
          <button
            onClick={onCancel}
            className="ml-auto p-1.5 text-gray-600 hover:text-red-400 hover:bg-gray-800 rounded-lg transition-colors"
            title="Cancelar tarefa"
          >
            <X size={13} />
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Main popup content ───────────────────────────────────────────────────────

export function PopupOverlayContent({
  runningTask,
  onClose,
  onNavigatePlanning,
  onResize,
  onStartTask,
  onPlay,
  onPause,
  onResume,
  onStop,
  onCancel,
}: PopupOverlayContentProps) {
  const today = todayISO();
  const { tasks, reload } = usePlannedTasksForDate(today);
  const { projects } = useProjects();
  const { categories } = useCategories();

  const pending = tasks.filter((t) => !t.completedDates.includes(today));
  const completedCount = tasks.length - pending.length;

  const projectName = projects.find((p) => p.id === runningTask?.projectId)?.name;
  const categoryName = categories.find((c) => c.id === runningTask?.categoryId)?.name;

  // Resize based on state
  useEffect(() => {
    if (runningTask) {
      onResize(POPUP_W, HEADER_H + EXEC_H + FOOTER_H);
    } else {
      const taskAreaH = pending.length === 0 ? EMPTY_H : Math.min(pending.length, MAX_ROWS) * ROW_H;
      onResize(POPUP_W, HEADER_H + NEW_TASK_H + SECTION_H + taskAreaH + FOOTER_H);
    }
  }, [pending.length, !!runningTask, onResize]); // eslint-disable-line react-hooks/exhaustive-deps

  async function handlePlay(task: PlannedTask) {
    await onPlay(task);
    await reload();
  }

  async function handleOpenApp() {
    await emit(OVERLAY_EVENTS.COMMAND_PALETTE_NAVIGATE, {
      page: "tasks",
    } satisfies CommandPaletteNavigatePayload);
  }

  return (
    <div className="w-full h-full flex flex-col bg-gray-900 border border-gray-700 rounded-xl shadow-2xl overflow-hidden">

      {/* Header */}
      <div
        className="flex items-center justify-between px-3 bg-gray-800 border-b border-gray-700 shrink-0"
        style={{ height: HEADER_H }}
      >
        <span className="text-xs font-medium text-gray-300 select-none pointer-events-none">
          {runningTask ? "Em execução" : "Tarefas de Hoje"}
        </span>
        <div className="flex gap-1">
          <button
            onClick={onNavigatePlanning}
            title="Ir para planejamento"
            className="p-1 text-gray-400 hover:text-gray-200 hover:bg-gray-700 rounded-lg transition-colors"
          >
            <LayoutList size={13} />
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

      {/* ── Running state: focused execution view ── */}
      {runningTask ? (
        <ExecSection
          task={runningTask}
          projectName={projectName}
          categoryName={categoryName}
          onPause={onPause}
          onResume={onResume}
          onStop={onStop}
          onCancel={onCancel}
        />
      ) : (
        <>
          {/* ── Idle state: new task + planned list ── */}

          {/* New task button */}
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
                    <button
                      onClick={() => handlePlay(task)}
                      className="p-1 text-gray-500 hover:text-green-400 hover:bg-green-900/20 rounded-lg transition-colors shrink-0"
                    >
                      <Play size={11} fill="currentColor" />
                    </button>
                  </div>
                );
              })
            )}
          </div>
        </>
      )}

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
