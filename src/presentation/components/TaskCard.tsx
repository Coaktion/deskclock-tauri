import { Play, Pencil, Trash2, CheckCheck } from "lucide-react";
import type { Task } from "@domain/entities/Task";
import type { Project } from "@domain/entities/Project";
import type { Category } from "@domain/entities/Category";
import { formatDurationCompact, formatTimeRange } from "@shared/utils/time";
import { getProjectColor } from "@shared/utils/projectColor";
import { TaskRow } from "@presentation/components/ui";

interface TaskCardProps {
  task: Task;
  projects: Project[];
  categories: Category[];
  sent?: boolean;
  playDisabled?: boolean;
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
  playDisabled = false,
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
      // A coluna do chevron **reservada**, na largura do ícone que a linha do
      // grupo põe ali. Vazia de verdade ela mede 0, e aí a faixa de horário
      // desta linha sobe 14px à esquerda da faixa do grupo — que é o que o
      // wireframe faz, medido, e é desalinhamento e não recuo.
      leading={<span className="w-3.5" aria-hidden />}
      nested={nested}
      meta={
        <span className="text-micro font-mono tabular-nums text-fg-muted">
          {formatTimeRange(task.startTime, task.endTime)}
        </span>
      }
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
              className="p-1 text-fg-muted hover:text-accent-text hover:bg-accent/10 rounded-control transition-colors"
            >
              <Play size={14} />
            </button>
          )}
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
