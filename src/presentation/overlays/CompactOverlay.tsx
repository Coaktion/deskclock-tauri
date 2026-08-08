import { Clock } from "lucide-react";
import { usePlannedTasksForDate } from "@presentation/hooks/usePlannedTasks";
import { useRunningTask } from "@presentation/hooks/useRunningTask";
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
      className="fixed bottom-4 right-4 z-40 w-10 h-10 bg-surface border border-border rounded-full shadow-xl flex items-center justify-center hover:bg-raised transition-colors"
    >
      <Clock size={18} className="text-fg-secondary" />
      {pendingCount > 0 && (
        <span className="absolute -top-1 -right-1 w-4 h-4 bg-accent text-white text-xs font-semibold rounded-full flex items-center justify-center">
          {pendingCount > 9 ? "9+" : pendingCount}
        </span>
      )}
    </button>
  );
}
