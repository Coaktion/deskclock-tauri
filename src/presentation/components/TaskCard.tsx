import { CheckCheck } from "lucide-react";
import type { Task } from "@domain/entities/Task";
import type { Project } from "@domain/entities/Project";
import type { Category } from "@domain/entities/Category";
import { formatDurationCompact, formatRegisteredTimeRange } from "@shared/utils/time";
import { getProjectColor } from "@shared/utils/projectColor";
import { Menu, RowMenuTrigger, TaskRow, type RowExecution } from "@presentation/components/ui";
import { isPlayBlocked, type PlayBlock } from "@presentation/components/playAction";
import { PlannedPlaySlot } from "@presentation/components/PlannedPlaySlot";
import { ENTRY_ROW_KEYS } from "@presentation/components/entryRowKey";
import { rowKeyDownHandler } from "@presentation/components/rowKey";
import { useEntryRowMenu } from "@presentation/hooks/useEntryRowMenu";

interface TaskCardProps {
  task: Task;
  projects: Project[];
  categories: Category[];
  sent?: boolean;
  /** Se a execução em curso impede este ▶ — e, quando ela tem a chave desta linha, quem o diz. */
  playBlock?: PlayBlock;
  /**
   * O realce da execução em curso, derivado **pela tela**. É prop própria, e não
   * uma leitura do `playBlock`: o bloqueio do ▶ vale para o grupo inteiro, o
   * realce não (ver `TaskGroupCard`).
   */
  execution?: RowExecution;
  /** Dentro de um grupo aberto — a linha ganha o trilho que a prende à de cima. */
  nested?: boolean;
  onPlay: (task: Task) => void;
  onEdit: (task: Task) => void;
  /** A tela passa o `removeWithUndo` do `useTaskUndo`: excluir aqui se desfaz. */
  onDelete: (task: Task) => void;
  onToggleBillable: (task: Task) => void;
}

/**
 * O lançamento nas Entradas de hoje, no desenho da linha planejada (spec
 * `acoes-da-linha-planejada.md`, G4): o ▶ sempre visível na coluna que não anda,
 * Editar e Excluir no ⋯ e no clique direito, clique na linha edita. Sem círculo
 * — lançamento não se conclui.
 */
export function TaskCard({
  task,
  projects,
  categories,
  sent = false,
  playBlock = "none",
  execution,
  nested = false,
  onPlay,
  onEdit,
  onDelete,
  onToggleBillable,
}: TaskCardProps) {
  const project = projects.find((p) => p.id === task.projectId);
  const category = categories.find((c) => c.id === task.categoryId);
  const subtitle = [project?.name, category?.name].filter(Boolean).join(" · ");
  const menu = useEntryRowMenu({
    onEdit: () => onEdit(task),
    onDelete: () => onDelete(task),
  });

  const handleKeyDown = rowKeyDownHandler(ENTRY_ROW_KEYS, {
    play: () => {
      if (!isPlayBlocked(playBlock)) onPlay(task);
    },
    edit: () => onEdit(task),
    delete: () => onDelete(task),
  });

  return (
    <>
      <TaskRow
        title={task.name ?? "(sem nome)"}
        subtitle={subtitle || undefined}
        // A coluna que a linha do grupo usa para o chevron, aqui vazia: quem lhe
        // dá largura é o primitivo, para as duas caírem no mesmo x.
        leading={<span aria-hidden />}
        execution={execution}
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
        onClick={() => onEdit(task)}
        onContextMenu={menu.openAtPointer}
        onKeyDown={handleKeyDown}
        /* Com duração, o ⋯ entra no lugar dela no hover, como a fileira de
           antes: a célula já está reservada e nada anda. */
        actions={<RowMenuTrigger menu={menu} />}
        trailing={
          <PlannedPlaySlot
            playBlock={playBlock}
            idleTitle="Iniciar com estes dados"
            onPlay={() => onPlay(task)}
          />
        }
      />

      {/* Irmão da linha, e não filho: os atalhos do menu não chegam à linha. */}
      <Menu
        anchor={menu.anchor}
        items={menu.items}
        onClose={menu.close}
        label="Ações do lançamento"
      />
    </>
  );
}
