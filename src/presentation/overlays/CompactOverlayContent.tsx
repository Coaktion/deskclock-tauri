import type { Task } from "@domain/entities/Task";
import { usePlannedTasksForDate } from "@presentation/hooks/usePlannedTasks";
import { useTaskTimer } from "@presentation/hooks/useTaskTimer";
import { formatHHMMSS, todayISO } from "@shared/utils/time";
import { ListTodo } from "lucide-react";
import { useWorkspaces } from "@presentation/contexts/WorkspaceContext";
import { WorkspaceDot } from "@presentation/components/WorkspaceDot";

interface CompactOverlayContentProps {
  runningTask: Task | null;
  isPopupOpen: boolean;
  overlaySize: "big" | "small";
  onMouseDown: () => void;
  onTogglePopup: () => void;
}

export function CompactOverlayContent({
  runningTask,
  isPopupOpen,
  overlaySize,
  onMouseDown,
  onTogglePopup,
}: CompactOverlayContentProps) {
  const today = todayISO();
  const { tasks } = usePlannedTasksForDate(today);
  const pendingCount = tasks.filter((t) => !t.completedDates.includes(today)).length;
  const seconds = useTaskTimer(runningTask);
  const { workspaces, activeWorkspace } = useWorkspaces();
  // Só sinaliza quando há mais de um workspace: com um só, a bolinha seria ruído
  // permanente num overlay de 68px.
  const showWorkspace = workspaces.length > 1 && !!activeWorkspace;

  const isRunning = runningTask?.status === "running";
  const isPaused = runningTask?.status === "paused";
  const hasTask = !!runningTask;

  const borderClass = isRunning
    ? "border-blue-500 overlay-ring-pulse"
    : isPaused
      ? "border-amber-500"
      : isPopupOpen
        ? "border-blue-500"
        : "border-gray-700";

  const timerColor = isPaused ? "text-amber-400" : "text-blue-400";

  const isSmall = overlaySize === "small";
  const maxW = isSmall ? "max-w-[68px]" : "max-w-[78px]";
  const maxH = isSmall ? "max-h-[44px]" : "max-h-[52px]";
  const rounded = isSmall ? "rounded-[6px]" : "rounded-xl";
  const roundedTop = isSmall ? "rounded-t-[6px]" : "rounded-t-xl";
  const roundedBottom = isSmall ? "rounded-b-[6px]" : "rounded-b-xl";
  const timerSize = isSmall ? "text-[12px]" : "text-[14px]";

  return (
    // inset-0 + m-auto centraliza dentro da janela (que no GTK pode ser 136px+).
    // max-w/max-h limitam a área visível ao tamanho correto.
    // Sem overflow-hidden para que o badge possa transbordar.
    <div
      data-tauri-drag-region
      className={`flex flex-col w-full h-full ${maxW} ${maxH} m-auto absolute inset-0 cursor-move bg-gray-900 border shadow-xl transition-colors duration-200 ${rounded} ${borderClass}`}
      title={
        (hasTask ? "Ver tarefa em execução" : "Ver tarefas planejadas") +
        (showWorkspace ? ` — ${activeWorkspace!.name}` : "")
      }
    >
      {showWorkspace && (
        <span className="absolute -top-1 -left-1 p-[2px] bg-gray-900 rounded-full pointer-events-none">
          <WorkspaceDot color={activeWorkspace!.color} size={7} />
        </span>
      )}
      <button
        onMouseDown={onMouseDown}
        onClick={onTogglePopup}
        className={`flex items-center justify-center hover:bg-gray-800/60 transition-colors w-full flex-1 cursor-pointer ${roundedTop}`}
      >
        {hasTask ? (
          <span
            className={`font-mono ${timerSize} font-semibold tabular-nums pointer-events-none leading-none ${timerColor}`}
          >
            {formatHHMMSS(seconds)}
          </span>
        ) : (
          <ListTodo size={18} className="text-blue-400 pointer-events-none" />
        )}
      </button>

      <div
        data-tauri-drag-region
        className={`p-1 gap-0.5 pointer-events-none flex flex-col items-center justify-center bg-gray-800 ${roundedBottom}`}
      >
        <div className="flex gap-0.5">
          <span className="w-[3px] h-[3px] bg-gray-200 rounded-full" />
          <span className="w-[3px] h-[3px] bg-gray-200 rounded-full" />
          <span className="w-[3px] h-[3px] bg-gray-200 rounded-full" />
          <span className="w-[3px] h-[3px] bg-gray-200 rounded-full" />
          <span className="w-[3px] h-[3px] bg-gray-200 rounded-full" />
        </div>
        <div className="flex gap-0.5">
          <span className="w-[3px] h-[3px] bg-gray-200 rounded-full" />
          <span className="w-[3px] h-[3px] bg-gray-200 rounded-full" />
          <span className="w-[3px] h-[3px] bg-gray-200 rounded-full" />
          <span className="w-[3px] h-[3px] bg-gray-200 rounded-full" />
          <span className="w-[3px] h-[3px] bg-gray-200 rounded-full" />
        </div>
      </div>

      {!hasTask && pendingCount > 0 && (
        <span className="absolute -top-[2px] -right-[4px] aspect-square min-h-[16px] px-[3px] bg-blue-600 text-white text-[10px] font-bold rounded-full flex items-center justify-center pointer-events-none z-10 leading-none">
          {pendingCount > 9 ? "9+" : pendingCount}
        </span>
      )}
    </div>
  );
}
