import { useState } from "react";
import { Play, Check, Copy, Trash2, RotateCcw, Pencil, Zap, RefreshCw } from "lucide-react";
import type { PlannedTask, PlannedTaskAction, ScheduleType } from "@domain/entities/PlannedTask";
import type { Project } from "@domain/entities/Project";
import type { Category } from "@domain/entities/Category";
import type { UUID } from "@shared/types";
import {
  EditPlannedTaskModal,
  type EditPlannedTaskInput,
} from "@presentation/modals/EditPlannedTaskModal";

interface PlannedTaskItemProps {
  task: PlannedTask;
  dateISO: string;
  projects: Project[];
  categories: Category[];
  playDisabled?: boolean;
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
}

export function PlannedTaskItem({
  task,
  dateISO,
  projects,
  categories,
  playDisabled = false,
  onPlay,
  onUpdate,
  onComplete,
  onUncomplete,
  onDuplicate,
  onDelete,
}: PlannedTaskItemProps) {
  const isCompleted = task.completedDates.includes(dateISO);
  const project = projects.find((p) => p.id === task.projectId);
  const category = categories.find((c) => c.id === task.categoryId);
  const [showModal, setShowModal] = useState(false);

  async function handleSave(id: string, input: EditPlannedTaskInput) {
    await onUpdate(id, input);
  }

  return (
    <>
      <div
        className={`relative flex items-center gap-3 pl-5 pr-3 py-3 border-b border-gray-800 hover:bg-gray-800/40 transition-colors group ${
          isCompleted ? "opacity-50" : ""
        }`}
      >
        {/* Billable left accent */}
        {task.billable && !isCompleted && (
          <span className="absolute left-0 top-2 bottom-2 w-0.5 bg-emerald-500 rounded-r-full" />
        )}

        {/* Dot indicator */}
        <span
          className={`shrink-0 w-1.5 h-1.5 rounded-full ${
            task.billable ? "bg-emerald-400" : "bg-gray-600"
          }`}
        />

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 min-w-0">
            <p className={`text-sm text-gray-100 truncate leading-snug ${isCompleted ? "line-through text-gray-500" : ""}`}>
              {task.name}
            </p>
            {task.scheduleType === "recurring" && (
              <span className="shrink-0 flex items-center gap-0.5 text-[10px] text-blue-400/70 leading-none">
                <RefreshCw size={9} />
              </span>
            )}
          </div>
          {(project || category || task.actions.length > 0) && (
            <p className="text-[11px] text-gray-500 truncate mt-0.5 flex items-center gap-1.5 leading-snug">
              {[project?.name, category?.name].filter(Boolean).join(" · ")}
              {task.scheduleType === "period" && task.periodEnd && (
                <span className="text-gray-600">até {task.periodEnd}</span>
              )}
              {task.actions.length > 0 && (
                <span className="inline-flex items-center gap-0.5 text-yellow-600/80">
                  <Zap size={9} />
                  {task.actions.length}
                </span>
              )}
            </p>
          )}
        </div>

        <div className="flex items-center gap-0.5 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
          {!isCompleted && !playDisabled && (
            <button
              onClick={() => onPlay(task)}
              title="Iniciar"
              className="p-1.5 text-gray-500 hover:text-emerald-400 hover:bg-emerald-900/20 rounded-lg transition-colors"
            >
              <Play size={13} />
            </button>
          )}

          <button
            onClick={() => setShowModal(true)}
            title="Editar"
            className="p-1.5 text-gray-500 hover:text-blue-400 hover:bg-blue-900/20 rounded-lg transition-colors"
          >
            <Pencil size={13} />
          </button>

          <button
            onClick={() =>
              isCompleted ? onUncomplete(task.id, dateISO) : onComplete(task.id, dateISO)
            }
            title={isCompleted ? "Marcar como pendente" : "Concluir"}
            className="p-1.5 text-gray-500 hover:text-blue-400 hover:bg-blue-900/20 rounded-lg transition-colors"
          >
            {isCompleted ? <RotateCcw size={13} /> : <Check size={13} />}
          </button>

          <button
            onClick={() => onDuplicate(task.id)}
            title="Duplicar"
            className="p-1.5 text-gray-500 hover:text-gray-200 hover:bg-gray-700 rounded-lg transition-colors"
          >
            <Copy size={13} />
          </button>

          <button
            onClick={() => onDelete(task.id)}
            title="Excluir"
            className="p-1.5 text-gray-500 hover:text-red-400 hover:bg-red-900/20 rounded-lg transition-colors"
          >
            <Trash2 size={13} />
          </button>
        </div>
      </div>

      {showModal && (
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
