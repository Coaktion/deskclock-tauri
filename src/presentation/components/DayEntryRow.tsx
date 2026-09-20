import type { Category } from "@domain/entities/Category";
import type { PlannedTaskAction } from "@domain/entities/PlannedTask";
import type { Project } from "@domain/entities/Project";
import type { Task } from "@domain/entities/Task";
import { selectionBoxClass } from "@presentation/components/selectionStyles";
import { Menu, RowMenuTrigger, TaskRow } from "@presentation/components/ui";
import { DAY_ENTRY_ROW_KEYS } from "@presentation/components/entryRowKey";
import { rowKeyDownHandler } from "@presentation/components/rowKey";
import { useEntryRowMenu } from "@presentation/hooks/useEntryRowMenu";
import { getProjectColor } from "@shared/utils/projectColor";
import { formatHHMMSS, formatRegisteredTimeRange } from "@shared/utils/time";

interface DayEntryRowProps {
  task: Task;
  projects: Project[];
  categories: Category[];
  /**
   * As ações da planejada que originou o lançamento, que o menu lista no fim
   * (H1). Vêm da tela porque é ela que tem o índice de planejadas; aqui a linha
   * só as repassa ao menu. O ⚡ que morava ao lado do chip saiu junto.
   */
  actions?: PlannedTaskAction[];
  selectMode?: boolean;
  selected?: boolean;
  onToggleSelect?: (id: string) => void;
  onEdit: (task: Task) => void;
  /** A tela passa o `removeWithUndo` do `useTaskUndo`: excluir aqui se desfaz. */
  onDelete: (task: Task) => void;
  onToggleBillable: (task: Task) => void;
}

/**
 * O lançamento já registrado numa lista por dia — as entradas do Histórico e os
 * apontamentos do Lançamento Manual —, no desenho da linha planejada (spec
 * `acoes-da-linha-planejada.md`, G5). As duas telas compartilham o componente
 * porque compartilham a linha inteira: mesma grade, mesmo par de ações (Editar
 * e Excluir no ⋯ e no clique direito) e mesmo modo de seleção.
 *
 * **Sem círculo e sem ▶**: lançamento passado não se conclui, e iniciar com os
 * dados dele é gesto das Entradas de hoje, não de uma lista do passado — por
 * isso não há coluna `trailing`, e a grade continua a que o wireframe desenha.
 */
export function DayEntryRow({
  task,
  projects,
  categories,
  actions = [],
  selectMode = false,
  selected = false,
  onToggleSelect,
  onEdit,
  onDelete,
  onToggleBillable,
}: DayEntryRowProps) {
  const project = projects.find((p) => p.id === task.projectId);
  const categoryName = categories.find((c) => c.id === task.categoryId)?.name;
  const subtitle = [project?.name, categoryName].filter(Boolean).join(" · ");
  const displayName = task.name ?? "(sem nome)";

  const menu = useEntryRowMenu({
    onEdit: () => onEdit(task),
    onDelete: () => onDelete(task),
    actions,
    disabled: selectMode,
  });

  const handleKeyDown = rowKeyDownHandler(DAY_ENTRY_ROW_KEYS, {
    edit: () => onEdit(task),
    delete: () => onDelete(task),
  });

  return (
    <>
      <TaskRow
        title={displayName}
        subtitle={subtitle || undefined}
        meta={
          <span className="text-micro font-mono tabular-nums text-fg-muted">
            {formatRegisteredTimeRange(task.startTime, task.durationSeconds, task.endTime)}
          </span>
        }
        duration={formatHHMMSS(task.durationSeconds ?? 0)}
        billable={task.billable}
        onToggleBillable={() => onToggleBillable(task)}
        dotColor={getProjectColor(project)}
        selected={selected}
        onClick={selectMode ? () => onToggleSelect?.(task.id) : () => onEdit(task)}
        leading={
          selectMode ? (
            <input
              type="checkbox"
              checked={selected}
              onChange={() => onToggleSelect?.(task.id)}
              onClick={(e) => e.stopPropagation()}
              aria-label={`Selecionar ${displayName}`}
              className={selectionBoxClass}
            />
          ) : undefined
        }
        /* No modo de seleção a linha inteira é alvo de marcar: nem menu, nem
           foco de teclado — as setas pulam a linha que não tem o que acionar. */
        onContextMenu={selectMode ? undefined : menu.openAtPointer}
        onKeyDown={selectMode ? undefined : handleKeyDown}
        actions={selectMode ? undefined : <RowMenuTrigger menu={menu} />}
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
