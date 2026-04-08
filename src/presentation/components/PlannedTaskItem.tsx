import { Play, Check, Copy, Trash2, RotateCcw } from "lucide-react";
import type { PlannedTask } from "@domain/entities/PlannedTask";
import type { Project } from "@domain/entities/Project";
import type { Category } from "@domain/entities/Category";

interface PlannedTaskItemProps {
  task: PlannedTask;
  dateISO: string;
  projects: Project[];
  categories: Category[];
  onPlay: (task: PlannedTask) => void;
  onComplete: (id: string, date: string) => void;
  onUncomplete: (id: string, date: string) => void;
  onDuplicate: (id: string) => void;
  onDelete: (id: string) => void;
}

export function PlannedTaskItem({
  task,
  dateISO,
  projects,
  categories,
  onPlay,
  onComplete,
  onUncomplete,
  onDuplicate,
  onDelete,
}: PlannedTaskItemProps) {
  const isCompleted = task.completedDates.includes(dateISO);
  const project = projects.find((p) => p.id === task.projectId);
  const category = categories.find((c) => c.id === task.categoryId);

  return (
    <div
      className={`flex items-center gap-3 px-4 py-3 border-b border-gray-800 hover:bg-gray-800/40 transition-colors ${
        isCompleted ? "opacity-50" : ""
      }`}
    >
      <div className="flex-1 min-w-0">
        <p className={`text-sm text-gray-100 truncate ${isCompleted ? "line-through" : ""}`}>
          {task.name}
        </p>
        {(project || category) && (
          <p className="text-xs text-gray-500 truncate mt-0.5">
            {[project?.name, category?.name].filter(Boolean).join(" · ")}
          </p>
        )}
      </div>

      <div className="flex items-center gap-1 shrink-0">
        {!isCompleted && (
          <button
            onClick={() => onPlay(task)}
            title="Iniciar"
            className="p-1.5 text-gray-400 hover:text-green-400 hover:bg-green-900/20 rounded transition-colors"
          >
            <Play size={14} />
          </button>
        )}

        <button
          onClick={() =>
            isCompleted ? onUncomplete(task.id, dateISO) : onComplete(task.id, dateISO)
          }
          title={isCompleted ? "Marcar como pendente" : "Concluir"}
          className="p-1.5 text-gray-400 hover:text-blue-400 hover:bg-blue-900/20 rounded transition-colors"
        >
          {isCompleted ? <RotateCcw size={14} /> : <Check size={14} />}
        </button>

        <button
          onClick={() => onDuplicate(task.id)}
          title="Duplicar"
          className="p-1.5 text-gray-400 hover:text-gray-200 hover:bg-gray-700 rounded transition-colors"
        >
          <Copy size={14} />
        </button>

        <button
          onClick={() => onDelete(task.id)}
          title="Excluir"
          className="p-1.5 text-gray-400 hover:text-red-400 hover:bg-red-900/20 rounded transition-colors"
        >
          <Trash2 size={14} />
        </button>
      </div>
    </div>
  );
}
