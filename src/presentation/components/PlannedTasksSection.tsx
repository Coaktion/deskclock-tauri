import { Play } from "lucide-react";
import type { PlannedTask } from "@domain/entities/PlannedTask";
import type { Project } from "@domain/entities/Project";

interface PlannedTasksSectionProps {
  tasks: PlannedTask[];
  projects: Project[];
  dateISO: string;
  onPlay: (task: PlannedTask) => void;
}

export function PlannedTasksSection({
  tasks,
  projects,
  dateISO,
  onPlay,
}: PlannedTasksSectionProps) {
  const pending = tasks.filter((t) => !t.completedDates.includes(dateISO));
  if (pending.length === 0) return null;

  return (
    <section>
      <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
        Planejadas para hoje
      </h2>
      <div className="flex flex-col gap-1">
        {pending.map((task) => {
          const project = projects.find((p) => p.id === task.projectId);
          return (
            <div
              key={task.id}
              className="flex items-center justify-between px-3 py-2 bg-gray-800/60 rounded-lg"
            >
              <div className="min-w-0 flex-1">
                <p className="text-sm text-gray-200 truncate">{task.name}</p>
                {project && (
                  <p className="text-xs text-gray-500 truncate">{project.name}</p>
                )}
              </div>
              <button
                onClick={() => onPlay(task)}
                className="ml-2 p-1.5 text-gray-400 hover:text-green-400 hover:bg-green-900/20 rounded transition-colors shrink-0"
                title="Iniciar"
              >
                <Play size={14} />
              </button>
            </div>
          );
        })}
      </div>
    </section>
  );
}
