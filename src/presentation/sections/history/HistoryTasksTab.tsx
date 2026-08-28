import type { Category } from "@domain/entities/Category";
import type { Project } from "@domain/entities/Project";
import type { Task } from "@domain/entities/Task";
import { selectionBoxClass } from "@presentation/components/selectionStyles";
import { Button, IconButton, SectionCard, TaskRow } from "@presentation/components/ui";
import type { DayGroup } from "@presentation/hooks/useHistory";
import {
  formatHHMM,
  formatHHMMSS,
  formatHistoryDayHeader,
  formatRegisteredTimeRange,
} from "@shared/utils/time";
import { Pencil, Trash2 } from "lucide-react";

import { projectColorOf } from "./projectColorOf";

interface HistoryTasksTabProps {
  groups: DayGroup[];
  /** Todas as tarefas do resultado, na ordem dos grupos — a base do "todas". */
  allTasks: Task[];
  projects: Project[];
  categories: Category[];
  selectMode: boolean;
  selectedIds: Set<string>;
  /** Workspace de destino existe: com um só, mover não é escolha. */
  canMoveToWorkspace: boolean;
  onEnterSelectMode: () => void;
  onExitSelectMode: () => void;
  onToggleSelectTask: (id: string) => void;
  onChangeSelection: (updater: (prev: Set<string>) => Set<string>) => void;
  onMoveSelected: () => void;
  onBulkDelete: () => void;
  onEditTask: (task: Task) => void;
  onRemoveTask: (id: string) => void;
  onToggleBillable: (task: Task) => void;
}

/**
 * A aba de tarefas do Histórico: a barra de seleção em lote e a lista de
 * entradas agrupadas por dia. O estado da seleção mora na página, não aqui —
 * trocar de aba não pode desmarcar o que já estava marcado.
 */
export function HistoryTasksTab({
  groups,
  allTasks,
  projects,
  categories,
  selectMode,
  selectedIds,
  canMoveToWorkspace,
  onEnterSelectMode,
  onExitSelectMode,
  onToggleSelectTask,
  onChangeSelection,
  onMoveSelected,
  onBulkDelete,
  onEditTask,
  onRemoveTask,
  onToggleBillable,
}: HistoryTasksTabProps) {
  if (groups.length === 0) {
    return <p className="text-center text-fg-muted text-sm py-12">Nenhum registro encontrado</p>;
  }

  const allSelected = allTasks.length > 0 && selectedIds.size >= allTasks.length;

  return (
    <>
      <div className="flex items-center justify-between px-1">
        <span className="text-overline uppercase text-fg-secondary">Entradas</span>
        {selectMode ? (
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              onClick={() =>
                onChangeSelection(() =>
                  allSelected ? new Set() : new Set(allTasks.map((t) => t.id))
                )
              }
            >
              {allSelected ? "Desmarcar todas" : "Selecionar todas"}
            </Button>
            {canMoveToWorkspace && (
              <Button variant="ghost" onClick={onMoveSelected} disabled={selectedIds.size === 0}>
                Mover para workspace
              </Button>
            )}
            <Button variant="danger" onClick={onBulkDelete} disabled={selectedIds.size === 0}>
              Excluir{selectedIds.size > 0 ? ` (${selectedIds.size})` : ""}
            </Button>
            <Button variant="ghost" onClick={onExitSelectMode}>
              Cancelar
            </Button>
          </div>
        ) : (
          <Button variant="secondary" size="sm" onClick={onEnterSelectMode}>
            Selecionar tarefas
          </Button>
        )}
      </div>

      {groups.map((group) => {
        const groupIds = group.tasks.map((t) => t.id);
        const allInGroup = groupIds.length > 0 && groupIds.every((id) => selectedIds.has(id));
        const someInGroup = groupIds.some((id) => selectedIds.has(id));
        const dayLabel = formatHistoryDayHeader(group.dateISO);

        return (
          <SectionCard
            key={group.dateISO}
            // O cartão é item de uma coluna de flex: sem isto ele se espremeria
            // na altura disponível em vez de somar com os irmãos.
            className="shrink-0"
            title={dayLabel}
            leading={
              selectMode && groupIds.length > 0 ? (
                <input
                  type="checkbox"
                  checked={allInGroup}
                  // Seleção parcial: traço em vez de vazio, senão o dia com
                  // metade das linhas marcadas lê como dia sem nada marcado.
                  ref={(el) => {
                    if (el) el.indeterminate = someInGroup && !allInGroup;
                  }}
                  onChange={() =>
                    onChangeSelection((prev) => {
                      // A decisão sai de `prev`, não do closure do render:
                      // o updater tem de valer sozinho na fila do React.
                      const todas = groupIds.every((id) => prev.has(id));
                      const next = new Set(prev);
                      if (todas) groupIds.forEach((id) => next.delete(id));
                      else groupIds.forEach((id) => next.add(id));
                      return next;
                    })
                  }
                  aria-label={`Selecionar ${dayLabel}`}
                  className={selectionBoxClass}
                />
              ) : undefined
            }
            action={
              <span className="font-mono tabular-nums text-fg-secondary">
                {formatHHMM(group.totalSeconds)}
              </span>
            }
          >
            {group.tasks.map((task) => {
              const project = projects.find((p) => p.id === task.projectId);
              const category = categories.find((c) => c.id === task.categoryId);
              const isSelected = selectedIds.has(task.id);
              const subtitle = [project?.name, category?.name].filter(Boolean).join(" · ");

              return (
                <TaskRow
                  key={task.id}
                  title={task.name ?? "(sem nome)"}
                  subtitle={subtitle || undefined}
                  meta={
                    <span className="text-micro font-mono tabular-nums text-fg-muted">
                      {formatRegisteredTimeRange(
                        task.startTime,
                        task.durationSeconds,
                        task.endTime
                      )}
                    </span>
                  }
                  duration={formatHHMMSS(task.durationSeconds ?? 0)}
                  billable={task.billable}
                  onToggleBillable={() => onToggleBillable(task)}
                  dotColor={projectColorOf(projects, task.projectId)}
                  selected={isSelected}
                  onClick={selectMode ? () => onToggleSelectTask(task.id) : undefined}
                  leading={
                    selectMode ? (
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => onToggleSelectTask(task.id)}
                        onClick={(e) => e.stopPropagation()}
                        aria-label={`Selecionar ${task.name ?? "(sem nome)"}`}
                        className={selectionBoxClass}
                      />
                    ) : undefined
                  }
                  actions={
                    selectMode ? undefined : (
                      <>
                        <IconButton
                          icon={<Pencil size={14} />}
                          title="Editar"
                          size="sm"
                          onClick={() => onEditTask(task)}
                        />
                        <IconButton
                          icon={<Trash2 size={14} />}
                          title="Excluir"
                          variant="danger"
                          size="sm"
                          onClick={() => onRemoveTask(task.id)}
                        />
                      </>
                    )
                  }
                />
              );
            })}
          </SectionCard>
        );
      })}
    </>
  );
}
