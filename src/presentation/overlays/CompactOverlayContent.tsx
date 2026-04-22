import { Clock } from "lucide-react";
import { usePlannedTasksForDate } from "@presentation/hooks/usePlannedTasks";
import { todayISO } from "@shared/utils/time";

interface CompactOverlayContentProps {
  onExpand: () => void;
  onStartTask: (input: {
    name?: string | null;
    projectId?: string | null;
    categoryId?: string | null;
    billable: boolean;
  }) => Promise<void>;
}

export function CompactOverlayContent({ onExpand, onStartTask }: CompactOverlayContentProps) {
  const today = todayISO();
  const { tasks } = usePlannedTasksForDate(today);

  const pendingCount = tasks.filter((t) => !t.completedDates.includes(today)).length;

  async function handleClick() {
    if (pendingCount > 0) {
      onExpand();
    } else {
      await onStartTask({ billable: true });
    }
  }

  return (
    <div
      data-tauri-drag-region
      className="w-full h-full relative cursor-move select-none"
      title={pendingCount > 0 ? "Ver tarefas planejadas" : "Iniciar nova tarefa"}
    >
      {/* Fundo circular — sem drag-region para não bloquear o botão central */}
      <div
        className="absolute inset-0 bg-gray-900 border border-gray-700 rounded-full shadow-xl pointer-events-none"
      />

      {/* Botão central menor — deixa o anel externo livre para arrastar */}
      <button
        onClick={handleClick}
        className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-800 transition-colors"
      >
        <Clock size={16} className="text-blue-400" />
      </button>

      {/* Grip visual — 3 pontos na borda inferior */}
      <div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex gap-0.5 pointer-events-none">
        <span className="w-1 h-1 bg-gray-600 rounded-full" />
        <span className="w-1 h-1 bg-gray-600 rounded-full" />
        <span className="w-1 h-1 bg-gray-600 rounded-full" />
      </div>

      {/* Badge dentro dos limites da janela */}
      {pendingCount > 0 && (
        <span className="absolute top-0 right-0 min-w-[16px] min-h-[16px] h-4 px-[3px] bg-blue-600 text-white text-[10px] font-bold rounded-full flex items-center justify-center pointer-events-none z-10">
          {pendingCount > 9 ? "9+" : pendingCount}
        </span>
      )}
    </div>
  );
}
