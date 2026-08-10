import { Play, Pencil, Trash2, CheckCheck } from "lucide-react";
import type { Task } from "@domain/entities/Task";
import type { Project } from "@domain/entities/Project";
import type { Category } from "@domain/entities/Category";
import { formatDurationCompact } from "@shared/utils/time";
import { getProjectColor } from "@shared/utils/projectColor";
import { TaskRow } from "@presentation/components/ui";

interface TaskCardProps {
  task: Task;
  projects: Project[];
  categories: Category[];
  sent?: boolean;
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
  sent = false,
  playDisabled = false,
  onPlay,
  onEdit,
  onDelete,
  onToggleBillable,
}: TaskCardProps) {
  const project = projects.find((p) => p.id === task.projectId);
  const category = categories.find((c) => c.id === task.categoryId);
  const subtitle = [project?.name, category?.name].filter(Boolean).join(" · ");

  return (
    <TaskRow
      title={task.name ?? "(sem nome)"}
      subtitle={subtitle || undefined}
      duration={formatDurationCompact(task.durationSeconds ?? 0)}
      billable={task.billable}
      dotColor={getProjectColor(task.projectId)}
      onToggleBillable={() => onToggleBillable(task)}
      badges={
        sent && (
          <span title="Enviado para o Google Sheets" className="shrink-0 text-billable">
            <CheckCheck size={14} />
          </span>
        )
      }
      actions={
        <>
          {!playDisabled && (
            <button
              onClick={() => onPlay(task)}
              title="Iniciar com estes dados"
              className="p-1.5 text-fg-muted hover:text-accent-text hover:bg-accent/10 rounded-control transition-colors"
            >
              <Play size={14} />
            </button>
          )}
          <button
            onClick={() => onEdit(task)}
            title="Editar"
            className="p-1.5 text-fg-muted hover:text-accent-text hover:bg-accent/10 rounded-control transition-colors"
          >
            <Pencil size={14} />
          </button>
          <button
            onClick={() => onDelete(task)}
            title="Excluir"
            className="p-1.5 text-fg-muted hover:text-danger hover:bg-danger/10 rounded-control transition-colors"
          >
            <Trash2 size={14} />
          </button>
        </>
      }
    />
  );
}
