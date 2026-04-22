import { Play, Pencil, Trash2, CheckCheck } from "lucide-react";
import type { Task } from "@domain/entities/Task";
import type { Project } from "@domain/entities/Project";
import type { Category } from "@domain/entities/Category";
import { formatDurationCompact } from "@shared/utils/time";
import { getProjectColor } from "@shared/utils/projectColor";

interface TaskCardProps {
  task: Task;
  projects: Project[];
  categories: Category[];
  playDisabled?: boolean;
  onPlay: (task: Task) => void;
  onEdit: (task: Task) => void;
  onDelete: (task: Task) => void;
  onToggleBillable: (task: Task) => void;
}

export function TaskCard({
  task,
  projects,
  categories,
  playDisabled = false,
  onPlay,
  onEdit,
  onDelete,
  onToggleBillable,
}: TaskCardProps) {
  const project = projects.find((p) => p.id === task.projectId);
  const category = categories.find((c) => c.id === task.categoryId);
  const displayName = task.name ?? "(sem nome)";

  const projectColor = getProjectColor(task.projectId);

  return (
    <div className="relative flex items-center gap-2 py-2 px-3 hover:bg-gray-800/50 rounded-lg group transition-colors">
      {task.billable && (
        <span className="absolute left-0 top-2 bottom-2 w-0.5 bg-emerald-500 rounded-r-full" />
      )}
      <button
        onClick={() => onToggleBillable(task)}
        title={task.billable ? "Billable — clique para alterar" : "Non-billable — clique para alterar"}
        className="flex-shrink-0 w-2 h-2 rounded-full mt-0.5 transition-colors"
        style={{ backgroundColor: projectColor }}
      />

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
      {task.sentToSheets && (
        <span title="Enviado para o Google Sheets" className="text-green-500 flex-shrink-0">
          <CheckCheck size={12} />
        </span>
      )}

      <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        {!playDisabled && (
          <button
            onClick={() => onPlay(task)}
            title="Iniciar com estes dados"
            className="p-1 text-gray-500 hover:text-green-400"
          >
            <Play size={13} />
          </button>
        )}
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
