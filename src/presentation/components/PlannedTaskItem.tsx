import { useState } from "react";
import { Play, Check, Copy, Trash2, RotateCcw, Pencil, Zap, RefreshCw, Bell } from "lucide-react";
import type { PlannedTask, PlannedTaskAction, ScheduleType } from "@domain/entities/PlannedTask";
import type { Project } from "@domain/entities/Project";
import type { Category } from "@domain/entities/Category";
import type { UUID } from "@shared/types";
import {
  EditPlannedTaskModal,
  type EditPlannedTaskInput,
} from "@presentation/modals/EditPlannedTaskModal";
import { IconButton, TaskRow } from "@presentation/components/ui";
import { getProjectColor } from "@shared/utils/projectColor";

interface PlannedTaskItemProps {
  task: PlannedTask;
  dateISO: string;
  projects: Project[];
  categories: Category[];
  playDisabled?: boolean;
  /** true quando o rastreamento automático está acompanhando esta reunião para notificar. */
  tracked?: boolean;
  onPlay: (task: PlannedTask) => void;
  onUpdate: (
    id: string,
    input: {
      name?: string;
      projectId?: UUID | null;
      categoryId?: UUID | null;
      billable?: boolean;
      scheduleType?: ScheduleType;
      scheduleDate?: string | null;
      recurringDays?: number[] | null;
      periodStart?: string | null;
      periodEnd?: string | null;
      actions?: PlannedTaskAction[];
    }
  ) => Promise<void>;
  onComplete: (id: string, date: string) => void;
  onUncomplete: (id: string, date: string) => void;
  onDuplicate: (id: string) => void;
  onDelete: (id: string) => void;
  selectMode?: boolean;
  selected?: boolean;
  onToggleSelect?: (id: string) => void;
}

export function PlannedTaskItem({
  task,
  dateISO,
  projects,
  categories,
  playDisabled = false,
  tracked = false,
  onPlay,
  onUpdate,
  onComplete,
  onUncomplete,
  onDuplicate,
  onDelete,
  selectMode = false,
  selected = false,
  onToggleSelect,
}: PlannedTaskItemProps) {
  const isCompleted = task.completedDates.includes(dateISO);
  const project = projects.find((p) => p.id === task.projectId);
  const category = categories.find((c) => c.id === task.categoryId);
  const [showModal, setShowModal] = useState(false);

  async function handleSave(id: string, input: EditPlannedTaskInput) {
    await onUpdate(id, input);
  }

  const subtitle = (project || category || task.actions.length > 0) && (
    <span className="inline-flex items-center gap-1.5">
      {[project?.name, category?.name].filter(Boolean).join(" · ")}
      {task.scheduleType === "period" && task.periodEnd && <span>até {task.periodEnd}</span>}
      {task.actions.length > 0 && (
        <span className="inline-flex items-center gap-0.5 text-amber-500/80">
          <Zap size={14} />
          {task.actions.length}
        </span>
      )}
    </span>
  );

  return (
    <>
      <TaskRow
        title={task.name}
        completed={isCompleted}
        titleMarks={
          (task.scheduleType === "recurring" || tracked) && (
            <>
              {task.scheduleType === "recurring" && (
                <span className="shrink-0 flex items-center text-accent-text/70">
                  <RefreshCw size={14} />
                </span>
              )}
              {tracked && (
                <span
                  className="shrink-0 flex items-center text-accent-text/80"
                  title="Rastreada — o app vai lembrar de iniciar esta reunião"
                >
                  <Bell size={14} />
                </span>
              )}
            </>
          )
        }
        subtitle={subtitle || undefined}
        dotColor={getProjectColor(task.projectId)}
        billable={task.billable}
        leading={
          selectMode ? (
            <input
              type="checkbox"
              checked={selected}
              onChange={() => onToggleSelect?.(task.id)}
              onClick={(e) => e.stopPropagation()}
              className="accent-accent w-3.5 h-3.5 cursor-pointer"
            />
          ) : undefined
        }
        selected={selected}
        onClick={selectMode ? () => onToggleSelect?.(task.id) : undefined}
        /* Sem hover os botões não ocupam largura nenhuma: reservados, o espaço
           de cinco botões sai do nome da tarefa, que trunca numa linha vazia à
           direita (§5.3). */
        collapseActions
        actions={
          !selectMode && (
            <>
              {!isCompleted && !playDisabled && (
                <IconButton
                  icon={<Play size={14} />}
                  title="Iniciar"
                  size="sm"
                  onClick={() => onPlay(task)}
                />
              )}
              <IconButton
                icon={<Pencil size={14} />}
                title="Editar"
                size="sm"
                onClick={() => setShowModal(true)}
              />
              <IconButton
                icon={isCompleted ? <RotateCcw size={14} /> : <Check size={14} />}
                title={isCompleted ? "Marcar como pendente" : "Concluir"}
                size="sm"
                onClick={() =>
                  isCompleted ? onUncomplete(task.id, dateISO) : onComplete(task.id, dateISO)
                }
              />
              <IconButton
                icon={<Copy size={14} />}
                title="Duplicar"
                size="sm"
                variant="neutral"
                onClick={() => onDuplicate(task.id)}
              />
              <IconButton
                icon={<Trash2 size={14} />}
                title="Excluir"
                size="sm"
                variant="danger"
                onClick={() => onDelete(task.id)}
              />
            </>
          )
        }
      />

      {showModal && !selectMode && (
        <EditPlannedTaskModal
          task={task}
          projects={projects}
          categories={categories}
          onSave={handleSave}
          onClose={() => setShowModal(false)}
        />
      )}
    </>
  );
}
