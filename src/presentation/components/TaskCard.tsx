import { Play, Pencil, Trash2 } from "lucide-react";
import type { Task } from "@domain/entities/Task";
import type { Project } from "@domain/entities/Project";
import type { Category } from "@domain/entities/Category";
import { formatDurationCompact } from "@shared/utils/time";

interface TaskCardProps {
  task: Task;
  projects: Project[];
  categories: Category[];
  onPlay: (task: Task) => void;
  onEdit: (task: Task) => void;
  onDelete: (task: Task) => void;
  onToggleBillable: (task: Task) => void;
}

export function TaskCard({
  task, projects, categories, onPlay, onEdit, onDelete, onToggleBillable,
}: TaskCardProps) {
  const project = projects.find((p) => p.id === task.projectId);
  const category = categories.find((c) => c.id === task.categoryId);
  const displayName = task.name ?? "(sem nome)";

  return (
    <div className="flex items-center gap-2 py-1.5 px-2 rounded hover:bg-gray-800/50 group">
      <button
        onClick={() => onToggleBillable(task)}
        title={task.billable ? "Billable — clique para alterar" : "Non-billable — clique para alterar"}
        className="flex-shrink-0"
      >
        <span
          className={`inline-block w-2 h-2 rounded-full ${
            task.billable ? "bg-blue-400" : "bg-gray-600"
          }`}
        />
      </button>

      <div className="flex-1 min-w-0">
        <span className="text-sm text-gray-200 truncate block">{displayName}</span>
        <div className="flex gap-2 text-xs text-gray-500">
          {project && <span>{project.name}</span>}
          {category && <span>{category.name}</span>}
        </div>
      </div>

      <span className="text-xs text-gray-400 font-mono flex-shrink-0">
        {formatDurationCompact(task.durationSeconds ?? 0)}
      </span>

      <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        <button
          onClick={() => onPlay(task)}
          title="Iniciar com estes dados"
          className="p-1 text-gray-500 hover:text-green-400"
        >
          <Play size={13} />
        </button>
        <button
          onClick={() => onEdit(task)}
          title="Editar"
          className="p-1 text-gray-500 hover:text-blue-400"
        >
          <Pencil size={13} />
        </button>
        <button
          onClick={() => onDelete(task)}
          title="Excluir"
          className="p-1 text-gray-500 hover:text-red-400"
        >
          <Trash2 size={13} />
        </button>
      </div>
    </div>
  );
}
