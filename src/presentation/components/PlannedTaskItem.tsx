import { useState } from "react";
import { Play, Check, Copy, Trash2, RotateCcw, Pencil, Zap } from "lucide-react";
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
        className={`flex items-center gap-3 px-4 py-3 border-b border-gray-800 hover:bg-gray-800/40 transition-colors group ${
          isCompleted ? "opacity-50" : ""
        }`}
      >
        <div className="flex-1 min-w-0">
          <p className={`text-sm text-gray-100 truncate ${isCompleted ? "line-through" : ""}`}>
            {task.name}
          </p>
          {(project || category || task.actions.length > 0) && (
            <p className="text-xs text-gray-500 truncate mt-0.5 flex items-center gap-1.5">
              {[project?.name, category?.name].filter(Boolean).join(" · ")}
              {task.actions.length > 0 && (
                <span className="inline-flex items-center gap-0.5 text-yellow-600">
                  <Zap size={10} />
                  {task.actions.length}
                </span>
              )}
            </p>
          )}
        </div>

        <div className="flex items-center gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
          {!isCompleted && !playDisabled && (
            <button
              onClick={() => onPlay(task)}
              title="Iniciar"
              className="p-1.5 text-gray-400 hover:text-green-400 hover:bg-green-900/20 rounded transition-colors"
            >
              <Play size={14} />
            </button>
          )}

          <button
            onClick={() => setShowModal(true)}
            title="Editar"
            className="p-1.5 text-gray-400 hover:text-blue-400 hover:bg-blue-900/20 rounded transition-colors"
          >
            <Pencil size={14} />
          </button>

          <button
            onClick={() =>
              isCompleted ? onUncomplete(task.id, dateISO) : onComplete(task.id, dateISO)
            }
            title={isCompleted ? "Marcar como pendente" : "Concluir"}
            className="p-1.5 text-gray-400 hover:text-blue-400 hover:bg-blue-900/20 rounded transition-colors"
          >
            {isCompleted ? <RotateCcw size={14} /> : <Check size={14} />}
          </button>

          <button
            onClick={() => onDuplicate(task.id)}
            title="Duplicar"
            className="p-1.5 text-gray-400 hover:text-gray-200 hover:bg-gray-700 rounded transition-colors"
          >
            <Copy size={14} />
          </button>

          <button
            onClick={() => onDelete(task.id)}
            title="Excluir"
            className="p-1.5 text-gray-400 hover:text-red-400 hover:bg-red-900/20 rounded transition-colors"
          >
            <Trash2 size={14} />
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
