import { Play, GripVertical } from "lucide-react";
import type { PlannedTask } from "@domain/entities/PlannedTask";
import type { Project } from "@domain/entities/Project";
import type { Category } from "@domain/entities/Category";

interface PlannedTasksSectionProps {
  tasks: PlannedTask[];
  projects: Project[];
  categories?: Category[];
  dateISO: string;
  playDisabled?: boolean;
  onPlay: (task: PlannedTask) => void;
  onNavigatePlanning?: () => void;
}

export function PlannedTasksSection({
  tasks,
  projects,
  categories = [],
  dateISO,
  playDisabled = false,
  onPlay,
  onNavigatePlanning,
}: PlannedTasksSectionProps) {
  const pending = tasks.filter((t) => !t.completedDates.includes(dateISO));
  if (pending.length === 0) return null;

  return (
    <section>
      <div className="flex items-center justify-between mb-2">
        <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
          Planejadas para hoje
          <span className="ml-1.5 text-gray-600 normal-case font-normal">
            {pending.length}
          </span>
        </h2>
        {onNavigatePlanning && (
          <button
            onClick={onNavigatePlanning}
            className="text-[10px] text-gray-600 hover:text-blue-400 transition-colors"
          >
            Ver semana →
          </button>
        )}
      </div>
      <div className="flex flex-col gap-1 max-h-44 overflow-y-auto">
        {pending.map((task) => {
          const project = projects.find((p) => p.id === task.projectId);
          const category = categories.find((c) => c.id === task.categoryId);
          const dotColor = task.billable ? "bg-emerald-400" : "bg-gray-500";

          const subParts = [project?.name, category?.name].filter(Boolean);

          return (
            <div
              key={task.id}
              className="group relative flex items-center gap-2 pl-3 pr-2 py-2 bg-gray-800/60 hover:bg-gray-800 rounded-lg transition-colors"
            >
              {/* Billable left accent bar */}
              {task.billable && (
                <span className="absolute left-0 top-2 bottom-2 w-0.5 bg-emerald-500 rounded-r-full" />
              )}

              {/* Drag handle (visual only) */}
              <GripVertical
                size={12}
                className="shrink-0 text-gray-600 opacity-0 group-hover:opacity-100 transition-opacity cursor-grab"
              />

              {/* Color dot */}
              <span className={`shrink-0 w-1.5 h-1.5 rounded-full ${dotColor}`} />

              {/* Name + sub-label */}
              <div className="min-w-0 flex-1">
                <p className="text-sm text-gray-200 truncate leading-snug">
                  {task.name || "(sem nome)"}
                </p>
                {subParts.length > 0 && (
                  <p className="text-[10px] text-gray-500 truncate leading-snug">
                    {subParts.join(" · ")}
                  </p>
                )}
              </div>

              {/* Play button */}
              {!playDisabled && (
                <button
                  onClick={() => onPlay(task)}
                  className="shrink-0 ml-1 w-6 h-6 flex items-center justify-center rounded-full text-gray-500 opacity-0 group-hover:opacity-100 hover:text-blue-400 hover:bg-blue-500/10 transition-all"
                  title="Iniciar"
                >
                  <Play size={11} />
                </button>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
