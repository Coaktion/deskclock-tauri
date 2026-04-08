import { Clock } from "lucide-react";
import { usePlannedTasksForDate } from "@presentation/hooks/usePlannedTasks";
import { useRunningTask } from "@presentation/contexts/RunningTaskContext";
import { todayISO } from "@shared/utils/time";

interface CompactOverlayProps {
  onExpand: () => void;
}

export function CompactOverlay({ onExpand }: CompactOverlayProps) {
  const today = todayISO();
  const { tasks } = usePlannedTasksForDate(today);
  const { startTask, runningTask } = useRunningTask();

  if (runningTask) return null;

  const pendingCount = tasks.filter((t) => !t.completedDates.includes(today)).length;

  async function handleClick() {
    if (pendingCount > 0) {
      onExpand();
    } else {
      await startTask({ billable: true });
    }
  }

  return (
    <button
      onClick={handleClick}
      title={pendingCount > 0 ? "Ver tarefas planejadas" : "Iniciar nova tarefa"}
      className="fixed bottom-4 right-4 z-40 w-10 h-10 bg-gray-900 border border-gray-700 rounded-full shadow-xl flex items-center justify-center hover:bg-gray-800 transition-colors"
    >
      <Clock size={18} className="text-gray-300" />
      {pendingCount > 0 && (
        <span className="absolute -top-1 -right-1 w-4 h-4 bg-blue-600 text-white text-[10px] font-bold rounded-full flex items-center justify-center">
          {pendingCount > 9 ? "9+" : pendingCount}
        </span>
      )}
    </button>
  );
}
