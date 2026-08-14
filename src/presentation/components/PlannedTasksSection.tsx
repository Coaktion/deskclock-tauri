import { Play } from "lucide-react";
import type { PlannedTask } from "@domain/entities/PlannedTask";
import type { Project } from "@domain/entities/Project";
import type { Category } from "@domain/entities/Category";
import { IconButton, SectionCard, TaskRow } from "@presentation/components/ui";
import { isPlayBlocked, playTitle, resolvePlayBlock } from "@presentation/components/playAction";
import { pendingPlannedTasks } from "@domain/utils/plannedPending";
import { getProjectColor } from "@shared/utils/projectColor";

interface PlannedTasksSectionProps {
  tasks: PlannedTask[];
  projects: Project[];
  categories?: Category[];
  dateISO: string;
  /** De qual planejada veio a execução em curso — é ela que ganha o "já está em execução". */
  runningPlannedTaskId?: string | null;
  onPlay: (task: PlannedTask) => void;
  /** O chip de faturamento é controle em toda parte, então a lista precisa saber gravá-lo. */
  onToggleBillable: (task: PlannedTask) => void;
  onNavigatePlanning?: () => void;
}

export function PlannedTasksSection({
  tasks,
  projects,
  categories = [],
  dateISO,
  runningPlannedTaskId = null,
  onPlay,
  onToggleBillable,
  onNavigatePlanning,
}: PlannedTasksSectionProps) {
  const pending = pendingPlannedTasks(tasks, dateISO);
  if (pending.length === 0) return null;

  return (
    <SectionCard
      title="Planejadas para hoje"
      count={pending.length}
      action={
        onNavigatePlanning && (
          <button
            onClick={onNavigatePlanning}
            className="text-accent-text hover:opacity-80 transition-opacity"
          >
            Ver semana →
          </button>
        )
      }
    >
      {/* 166px: é o que faz o cartão cheio terminar no mesmo nível do bloco de
          KPI ao lado (dois cartões mais o degrau, menos este cabeçalho). */}
      <div className="max-h-[166px] overflow-y-auto">
        {pending.map((task) => {
          const project = projects.find((p) => p.id === task.projectId);
          const category = categories.find((c) => c.id === task.categoryId);
          const subtitle = [project?.name, category?.name].filter(Boolean).join(" · ");
          const block = resolvePlayBlock(runningPlannedTaskId, task.id);

          return (
            <TaskRow
              key={task.id}
              title={task.name || "(sem nome)"}
              subtitle={subtitle || undefined}
              billable={task.billable}
              onToggleBillable={() => onToggleBillable(task)}
              dotColor={getProjectColor(project)}
              actions={
                <IconButton
                  icon={<Play size={14} />}
                  title={playTitle(block)}
                  size="sm"
                  disabled={isPlayBlocked(block)}
                  onClick={() => onPlay(task)}
                />
              }
            />
          );
        })}
      </div>
    </SectionCard>
  );
}
