import type { Task } from "@domain/entities/Task";
import { usePlannedTasksForDate } from "@presentation/hooks/usePlannedTasks";
import { useTaskTimer } from "@presentation/hooks/useTaskTimer";
import { formatHHMMSS, todayISO } from "@shared/utils/time";
import { ListTodo } from "lucide-react";

interface CompactOverlayContentProps {
  runningTask: Task | null;
  isPopupOpen: boolean;
  onMouseDown: () => void;
  onTogglePopup: () => void;
}

export function CompactOverlayContent({
  runningTask,
  isPopupOpen,
  onMouseDown,
  onTogglePopup,
}: CompactOverlayContentProps) {
  const today = todayISO();
  const { tasks } = usePlannedTasksForDate(today);
  const pendingCount = tasks.filter((t) => !t.completedDates.includes(today)).length;
  const seconds = useTaskTimer(runningTask);

  const isRunning = runningTask?.status === "running";
  const isPaused  = runningTask?.status === "paused";
  const hasTask   = !!runningTask;

  const borderClass = isRunning
    ? "border-blue-500 overlay-ring-pulse"
    : isPaused
      ? "border-amber-500"
      : isPopupOpen
        ? "border-blue-500"
        : "border-gray-700";

  const timerColor = isPaused ? "text-amber-400" : "text-blue-400";

  return (
    <div
      data-tauri-drag-region
      className={`flex flex-col w-full h-full max-w-[78px] max-h-[52px] m-auto absolute inset-0 cursor-move bg-gray-900 border rounded-xl shadow-xl transition-colors duration-200 ${borderClass} overflow-hidden`}
      title={hasTask ? "Ver tarefa em execução" : "Ver tarefas planejadas"}
    >
      {/* Central button */}
      <button
        onMouseDown={onMouseDown}
        onClick={onTogglePopup}
        className="flex items-center justify-center hover:bg-gray-800/60 transition-colors w-full flex-1 cursor-pointer"
      >
        {hasTask ? (
          <span className={`font-mono text-[14px] font-semibold tabular-nums pointer-events-none leading-none ${timerColor}`}>
            {formatHHMMSS(seconds)}
          </span>
        ) : (
          <ListTodo size={18} className="text-blue-400 pointer-events-none" />
        )}
      </button>

      {/* Grip dots */}
      <div
        data-tauri-drag-region
        className="p-1 gap-0.5 pointer-events-none flex flex-col items-center justify-center bg-gray-800"
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

      {/* Pending badge — idle only */}
      {!hasTask && pendingCount > 0 && (
        <span className="absolute top-0 right-0 min-w-[16px] h-4 px-[3px] bg-blue-600 text-white text-[10px] font-bold rounded-full flex items-center justify-center pointer-events-none z-10 leading-none">
          {pendingCount > 9 ? "9+" : pendingCount}
        </span>
      )}
    </div>
  );
}
