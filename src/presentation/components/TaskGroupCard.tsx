import { useState } from "react";
import { ChevronDown, ChevronRight, Merge, CheckCheck, Edit2, FolderInput } from "lucide-react";
import type { Task } from "@domain/entities/Task";
import type { Project } from "@domain/entities/Project";
import type { Category } from "@domain/entities/Category";
import type { TaskGroup } from "@domain/utils/groupTasks";
import { formatDurationCompact, formatRegisteredTimeRange } from "@shared/utils/time";
import { getProjectColor } from "@shared/utils/projectColor";
import { TaskRow } from "@presentation/components/ui";
import { TaskCard } from "./TaskCard";

interface TaskGroupCardProps {
  group: TaskGroup;
  projects: Project[];
  categories: Category[];
  sentIds?: Set<string>;
  playDisabled?: boolean;
  selectable?: boolean;
  selected?: boolean;
  onToggleSelect?: (group: TaskGroup) => void;
  onPlay: (task: Task) => void;
  onEdit: (task: Task) => void;
  onDelete: (task: Task) => void;
  onMerge: (group: TaskGroup) => void;
  onEditGroup?: (group: TaskGroup) => void;
  /** Ausente = sem entrada de "mover para workspace" neste contexto. */
  onMoveToWorkspace?: (tasks: Task[]) => void;
  onToggleBillable: (task: Task) => void;
}

export function TaskGroupCard({
  group,
  projects,
  categories,
  sentIds,
  playDisabled = false,
  selectable = false,
  selected = false,
  onToggleSelect,
  onPlay,
  onEdit,
  onDelete,
  onMerge,
  onEditGroup,
  onMoveToWorkspace,
  onToggleBillable,
}: TaskGroupCardProps) {
  const [expanded, setExpanded] = useState(false);
  const { tasks } = group;
  const first = tasks[0];
  const project = projects.find((p) => p.id === first.projectId);
  const category = categories.find((c) => c.id === first.categoryId);
  const displayName = first.name ?? "(sem nome)";
  const isGroup = tasks.length > 1;
  const allSent = sentIds ? tasks.every((t) => sentIds.has(t.id)) : false;
  const someSent = !allSent && (sentIds ? tasks.some((t) => sentIds.has(t.id)) : false);

  function handleRowClick() {
    if (selectable) {
      onToggleSelect?.(group);
    } else if (isGroup) {
      setExpanded((v) => !v);
    }
  }

  const projectColor = getProjectColor(first.projectId);

  // Tarefa individual sem agrupamento: renderiza direto sem cabeçalho de grupo
  if (!isGroup && !selectable) {
    return (
      <TaskCard
        task={first}
        projects={projects}
        categories={categories}
        sent={sentIds?.has(first.id)}
        playDisabled={playDisabled}
        onPlay={onPlay}
        onEdit={onEdit}
        onDelete={onDelete}
        onToggleBillable={onToggleBillable}
      />
    );
  }

  const subtitle = [project?.name, category?.name].filter(Boolean).join(" · ");

  return (
    <>
      <TaskRow
        title={displayName}
        subtitle={subtitle || undefined}
        // A coluna de 88px responde "quantos" no grupo e "quando" na tarefa
        // solta — o design a reserva para o dado que situa a linha, não para
        // um sufixo do subtítulo.
        meta={
          <span className="text-micro font-mono tabular-nums text-fg-muted">
            {isGroup
              ? `${tasks.length} registros`
              : formatRegisteredTimeRange(first.startTime, first.durationSeconds, first.endTime)}
          </span>
        }
        duration={formatDurationCompact(group.totalSeconds)}
        billable={first.billable}
        // O chip do cabeçalho fala pelo grupo, então ele alterna o grupo — pelo
        // mesmo caminho da filha, que já vale para as irmãs. Informar sem deixar
        // clicar era a única linha da tela em que o chip não respondia.
        onToggleBillable={() => onToggleBillable(first)}
        dotColor={projectColor}
        selected={selectable && selected}
        onClick={handleRowClick}
        leading={
          selectable ? (
            <input
              type="checkbox"
              checked={selected}
              onChange={(e) => {
                e.stopPropagation();
                onToggleSelect?.(group);
              }}
              onClick={(e) => e.stopPropagation()}
              aria-label={`Selecionar ${displayName}`}
              className="shrink-0 w-3.5 h-3.5 accent-accent cursor-pointer"
            />
          ) : (
            isGroup && (
              <span className="text-fg-muted shrink-0">
                {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
              </span>
            )
          )
        }
        badges={
          (allSent || someSent) && (
            <span
              title={allSent ? "Enviado para o Google Sheets" : "Enviado parcialmente"}
              className={`shrink-0 ${allSent ? "text-billable" : "text-paused"}`}
            >
              <CheckCheck size={14} />
            </span>
          )
        }
        actions={
          <>
            {onMoveToWorkspace && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onMoveToWorkspace(tasks);
                }}
                title="Mover para workspace"
                className="p-1 text-fg-muted hover:text-accent-text hover:bg-accent/10 rounded-control transition-colors"
              >
                <FolderInput size={14} />
              </button>
            )}
            {isGroup && (
              <>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onEditGroup?.(group);
                  }}
                  title="Editar grupo"
                  className="p-1 text-fg-muted hover:text-accent-text hover:bg-accent/10 rounded-control transition-colors"
                >
                  <Edit2 size={14} />
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onMerge(group);
                  }}
                  title="Unificar"
                  className="p-1 text-fg-muted hover:text-accent-text hover:bg-accent/10 rounded-control transition-colors"
                >
                  <Merge size={14} />
                </button>
              </>
            )}
          </>
        }
      />

      {/*
       * As filhas não são recuadas: recuar moveria todas as colunas delas, e
       * quem diz o pertencimento é o trilho do `nested`. Sem casca em volta
       * porque, embrulhadas, a última filha vira `:last-child` do embrulho e
       * perde a régua no meio da lista — e o grupo recolhido também.
       */}
      {expanded &&
        tasks.map((t) => (
          <TaskCard
            key={t.id}
            nested
            task={t}
            projects={projects}
            categories={categories}
            sent={sentIds?.has(t.id)}
            playDisabled={playDisabled}
            onPlay={onPlay}
            onEdit={onEdit}
            onDelete={onDelete}
            onToggleBillable={onToggleBillable}
          />
        ))}
    </>
  );
}
