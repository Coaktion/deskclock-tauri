import type { Category } from "@domain/entities/Category";
import type { Project } from "@domain/entities/Project";
import type { TaskGroup } from "@domain/utils/groupTasks";
import { getProjectColor } from "@shared/utils/projectColor";
import { formatDurationCompact } from "@shared/utils/time";
import { Play } from "lucide-react";

const COMPLETED_ROW_H = 40;

interface CompletedTasksSectionProps {
  groups: TaskGroup[];
  totalSeconds: number;
  projects: Project[];
  categories: Category[];
  /** Inicia uma nova execução com os dados da tarefa concluída (repetir). */
  onRepeat: (group: TaskGroup) => void;
}

/**
 * Conteúdo da aba "Executadas": resumo do total do dia + lista rolável de tarefas
 * concluídas, agrupadas por nome+projeto+categoria. Preenche a altura do container
 * pai (h-full) — o popup define uma área fixa e a lista rola internamente.
 */
export function CompletedTasksSection({
  groups,
  totalSeconds,
  projects,
  categories,
  onRepeat,
}: CompletedTasksSectionProps) {
  if (groups.length === 0) {
    return (
      <div className="h-full flex items-center justify-center">
        <p className="text-center text-fg-muted text-xs">Nenhuma tarefa executada hoje</p>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      {/* Resumo do total do dia */}
      <div className="flex items-center px-3 py-1 border-b border-border-subtle/70 shrink-0">
        <span className="text-xs text-fg-muted">Total do dia</span>
        <span className="ml-auto text-xs tabular-nums text-fg-secondary font-mono">
          {formatDurationCompact(totalSeconds)}
        </span>
      </div>

      {/* Lista agrupada */}
      <div className="flex-1 overflow-y-auto">
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
              className="relative flex items-center gap-2 px-3 border-b border-border-subtle/70 hover:bg-raised/40 transition-colors"
              style={{ height: COMPLETED_ROW_H }}
            >
              <span
                className="absolute left-0 top-2 bottom-2 w-0.5 rounded-r-full"
                style={{ backgroundColor: railColor }}
              />
              <div className="flex-1 min-w-0 pl-1.5">
                <p className="text-xs font-medium text-fg-secondary truncate leading-tight">
                  {first.name || <span className="text-fg-muted italic">(sem nome)</span>}
                  {count > 1 && <span className="font-normal text-fg-muted"> ·{count}x</span>}
                </p>
                {subtitle && (
                  <p className="text-xs text-fg-muted truncate leading-tight mt-0.5">{subtitle}</p>
                )}
              </div>
              <span className="text-xs tabular-nums text-fg-secondary font-mono shrink-0">
                {formatDurationCompact(group.totalSeconds)}
              </span>
              <button
                onClick={() => onRepeat(group)}
                title="Repetir tarefa"
                className="p-1 text-fg-muted hover:text-billable hover:bg-billable/10 rounded-control transition-colors shrink-0"
              >
                <Play size={14} fill="currentColor" />
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
