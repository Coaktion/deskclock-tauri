import { Play } from "lucide-react";
import type { PlannedTask } from "@domain/entities/PlannedTask";
import type { Project } from "@domain/entities/Project";
import type { Category } from "@domain/entities/Category";
import { SectionCard, TaskRow } from "@presentation/components/ui";
import { getProjectColor } from "@shared/utils/projectColor";

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
      <div className="p-1.5 pt-0 flex flex-col gap-0.5 max-h-44 overflow-y-auto">
        {pending.map((task) => {
          const project = projects.find((p) => p.id === task.projectId);
          const category = categories.find((c) => c.id === task.categoryId);
          const subtitle = [project?.name, category?.name].filter(Boolean).join(" · ");

          return (
            <TaskRow
              key={task.id}
              title={task.name || "(sem nome)"}
              subtitle={subtitle || undefined}
              billable={task.billable}
              dotColor={getProjectColor(task.projectId)}
              actions={
                playDisabled ? undefined : (
                  <button
                    onClick={() => onPlay(task)}
                    className="p-1.5 text-fg-muted hover:text-accent-text hover:bg-accent/10 rounded-control transition-colors"
                    title="Iniciar"
                  >
                    <Play size={14} />
                  </button>
                )
              }
            />
          );
        })}
      </div>
    </SectionCard>
  );
}
