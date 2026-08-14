import { Play, Pencil, Trash2, CheckCheck } from "lucide-react";
import type { Task } from "@domain/entities/Task";
import type { Project } from "@domain/entities/Project";
import type { Category } from "@domain/entities/Category";
import { formatDurationCompact, formatRegisteredTimeRange } from "@shared/utils/time";
import { getProjectColor } from "@shared/utils/projectColor";
import { IconButton, TaskRow } from "@presentation/components/ui";
import { isPlayBlocked, playTitle, type PlayBlock } from "@presentation/components/playAction";

interface TaskCardProps {
  task: Task;
  projects: Project[];
  categories: Category[];
  sent?: boolean;
  /** Se a execução em curso impede este ▶ — e, quando ela tem a chave desta linha, quem o diz. */
  playBlock?: PlayBlock;
  /** Dentro de um grupo aberto — a linha ganha o trilho que a prende à de cima. */
  nested?: boolean;
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
  playBlock = "none",
  nested = false,
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
      // A coluna que a linha do grupo usa para o chevron, aqui vazia: quem lhe
      // dá largura é o primitivo, para as duas caírem no mesmo x.
      leading={<span aria-hidden />}
      nested={nested}
      meta={
        <span className="text-micro font-mono tabular-nums text-fg-muted">
          {formatRegisteredTimeRange(task.startTime, task.durationSeconds, task.endTime)}
        </span>
      }
      duration={formatDurationCompact(task.durationSeconds ?? 0)}
      billable={task.billable}
      dotColor={getProjectColor(project)}
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
          <IconButton
            icon={<Play size={14} />}
            title={playTitle(playBlock, "Iniciar com estes dados")}
            size="sm"
            disabled={isPlayBlocked(playBlock)}
            onClick={() => onPlay(task)}
          />
          <button
            onClick={() => onEdit(task)}
            title="Editar"
            className="p-1 text-fg-muted hover:text-accent-text hover:bg-accent/10 rounded-control transition-colors"
          >
            <Pencil size={14} />
          </button>
          <button
            onClick={() => onDelete(task)}
            title="Excluir"
            className="p-1 text-fg-muted hover:text-danger hover:bg-danger/10 rounded-control transition-colors"
          >
            <Trash2 size={14} />
          </button>
        </>
      }
    />
  );
}
