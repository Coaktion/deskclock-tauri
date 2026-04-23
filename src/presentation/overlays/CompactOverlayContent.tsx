import { Clock } from "lucide-react";
import type { Task } from "@domain/entities/Task";
import { usePlannedTasksForDate } from "@presentation/hooks/usePlannedTasks";
import { useTaskTimer } from "@presentation/hooks/useTaskTimer";
import { todayISO, formatMMSS } from "@shared/utils/time";

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

  const isRunning = !!runningTask;
  const borderClass = isRunning
    ? "border-blue-500 overlay-ring-pulse"
    : isPopupOpen
    ? "border-blue-500"
    : "border-gray-700";

  return (
    <div
      data-tauri-drag-region
      className="w-full h-full relative cursor-move select-none"
      title={isRunning ? "Ver tarefa em execução" : "Ver tarefas planejadas"}
    >
      {/* Circular background + ring */}
      <div
        className={`absolute inset-0 bg-gray-900 border rounded-full shadow-xl pointer-events-none transition-colors duration-200 ${borderClass}`}
      />

      {/* Central button */}
      <button
        onMouseDown={onMouseDown}
        onClick={onTogglePopup}
        className="absolute inset-0 flex items-center justify-center rounded-full hover:bg-gray-800/60 transition-colors"
      >
        {isRunning ? (
          <span className="font-mono text-[11px] font-semibold tabular-nums text-blue-400 pointer-events-none leading-none">
            {formatMMSS(seconds)}
          </span>
        ) : (
          <Clock size={15} className="text-blue-400 pointer-events-none" />
        )}
      </button>

      {/* Grip dots */}
      <div className="absolute bottom-[5px] left-1/2 -translate-x-1/2 flex gap-0.5 pointer-events-none">
        <span className="w-[3px] h-[3px] bg-gray-600 rounded-full" />
        <span className="w-[3px] h-[3px] bg-gray-600 rounded-full" />
        <span className="w-[3px] h-[3px] bg-gray-600 rounded-full" />
      </div>

      {/* Pending badge — idle only */}
      {!isRunning && pendingCount > 0 && (
        <span className="absolute top-0 right-0 min-w-[16px] h-4 px-[3px] bg-blue-600 text-white text-[10px] font-bold rounded-full flex items-center justify-center pointer-events-none z-10 leading-none">
          {pendingCount > 9 ? "9+" : pendingCount}
        </span>
      )}
    </div>
  );
}
