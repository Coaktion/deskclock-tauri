import type { Category } from "@domain/entities/Category";
import type { Project } from "@domain/entities/Project";
import type { TaskGroup } from "@domain/utils/groupTasks";
import { getProjectColor } from "@shared/utils/projectColor";
import { formatDurationCompact } from "@shared/utils/time";
import { Play } from "lucide-react";

// Layout da seção (exportado para o cálculo de altura do popup no componente pai).
export const COMPLETED_SECTION_H = 28;
export const COMPLETED_ROW_H = 40;
export const MAX_COMPLETED_ROWS = 3;

interface CompletedTasksSectionProps {
  groups: TaskGroup[];
  totalSeconds: number;
  projects: Project[];
  categories: Category[];
  /** Inicia uma nova execução com os dados da tarefa concluída (repetir). */
  onRepeat: (group: TaskGroup) => void;
}

export function CompletedTasksSection({
  groups,
  totalSeconds,
  projects,
  categories,
  onRepeat,
}: CompletedTasksSectionProps) {
  const listH = Math.min(groups.length, MAX_COMPLETED_ROWS) * COMPLETED_ROW_H;

  return (
    <>
      {/* Divisória + header da seção */}
      <div
        className="flex items-center px-3 border-t border-gray-700/60 border-b border-gray-800 shrink-0"
        style={{ height: COMPLETED_SECTION_H }}
      >
        <span className="text-[10px] font-semibold uppercase tracking-widest text-gray-500">
          Executadas · {groups.length}
        </span>
        <span className="ml-auto text-[10px] tabular-nums text-gray-600 font-mono">
          {formatDurationCompact(totalSeconds)}
        </span>
      </div>

      {/* Lista agrupada */}
      <div className="overflow-y-auto shrink-0" style={{ height: listH }}>
        {groups.map((group) => {
          const first = group.tasks[0];
          const project = projects.find((p) => p.id === first.projectId);
          const category = categories.find((c) => c.id === first.categoryId);
          const subtitle = [project?.name, category?.name].filter(Boolean).join(" · ");
          const railColor = getProjectColor(first.projectId);
          const count = group.tasks.length;

          return (
            <div
              key={group.key}
              className="relative flex items-center gap-2 px-3 border-b border-gray-800/70 hover:bg-gray-800/40 transition-colors"
              style={{ height: COMPLETED_ROW_H }}
            >
              <span
                className="absolute left-0 top-2 bottom-2 w-0.5 rounded-r-full"
                style={{ backgroundColor: railColor }}
              />
              <div className="flex-1 min-w-0 pl-1.5">
                <p className="text-[12px] font-medium text-gray-300 truncate leading-tight">
                  {first.name || <span className="text-gray-500 italic">(sem nome)</span>}
                  {count > 1 && <span className="font-normal text-gray-500"> ·{count}x</span>}
                </p>
                {subtitle && (
                  <p className="text-[10px] text-gray-500 truncate leading-tight mt-0.5">
                    {subtitle}
                  </p>
                )}
              </div>
              <span className="text-[10px] tabular-nums text-gray-400 font-mono shrink-0">
                {formatDurationCompact(group.totalSeconds)}
              </span>
              <button
                onClick={() => onRepeat(group)}
                title="Repetir tarefa"
                className="p-1 text-gray-500 hover:text-green-400 hover:bg-green-900/20 rounded-lg transition-colors shrink-0"
              >
                <Play size={11} fill="currentColor" />
              </button>
            </div>
          );
        })}
      </div>
    </>
  );
}
