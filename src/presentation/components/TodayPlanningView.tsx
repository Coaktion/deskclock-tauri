const DAY_NAMES = ["domingo", "segunda-feira", "terça-feira", "quarta-feira", "quinta-feira", "sexta-feira", "sábado"];
const MONTH_NAMES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];

function formatTodayHeader(dateISO: string): string {
  const d = new Date(dateISO + "T12:00:00Z");
  const day = DAY_NAMES[d.getUTCDay()];
  const date = d.getUTCDate();
  const month = MONTH_NAMES[d.getUTCMonth()];
  const year = d.getUTCFullYear();
  return `${day.charAt(0).toUpperCase() + day.slice(1)}, ${date} de ${month} de ${year}`;
}

import { useProjects } from "@presentation/hooks/useProjects";
import { useCategories } from "@presentation/hooks/useCategories";
import { usePlannedTasksForDate } from "@presentation/hooks/usePlannedTasks";
import { useRunningTask } from "@presentation/contexts/RunningTaskContext";
import { PlannedTaskForm } from "@presentation/components/PlannedTaskForm";
import { PlannedTaskItem } from "@presentation/components/PlannedTaskItem";
import { startPlannedTask } from "@domain/usecases/plannedTasks/StartPlannedTask";
import { PlannedTaskRepository } from "@infra/database/PlannedTaskRepository";
import { TaskRepository } from "@infra/database/TaskRepository";
import { todayISO } from "@shared/utils/time";
import type { PlannedTask } from "@domain/entities/PlannedTask";

const plannedRepo = new PlannedTaskRepository();
const taskRepo = new TaskRepository();

export function TodayPlanningView() {
  const today = todayISO();
  const { projects } = useProjects();
  const { categories } = useCategories();
  const { tasks, reload, create, remove, complete, uncomplete, duplicate } =
    usePlannedTasksForDate(today);
  const { startTask } = useRunningTask();

  async function handlePlay(task: PlannedTask) {
    await startPlannedTask(plannedRepo, taskRepo, task.id, new Date().toISOString());
    // Sincroniza o contexto buscando a tarefa recém-criada
    await startTask({
      name: task.name,
      projectId: task.projectId,
      categoryId: task.categoryId,
      billable: task.billable,
    });
    await reload();
  }

  const pending = tasks.filter((t) => !t.completedDates.includes(today));
  const completed = tasks.filter((t) => t.completedDates.includes(today));

  return (
    <div className="flex flex-col">
      <div className="px-4 py-3 border-b border-gray-700">
        <h2 className="text-sm font-medium text-gray-200">{formatTodayHeader(today)}</h2>
      </div>
      <PlannedTaskForm
        projects={projects}
        categories={categories}
        showDateFields={false}
        onSubmit={async (data) =>
          create({ ...data, scheduleType: "specific_date", scheduleDate: today })
        }
      />

      {tasks.length === 0 && (
        <p className="text-center text-gray-500 text-sm py-8">
          Nenhuma tarefa planejada para hoje
        </p>
      )}

      {pending.map((task) => (
        <PlannedTaskItem
          key={task.id}
          task={task}
          dateISO={today}
          projects={projects}
          categories={categories}
          onPlay={handlePlay}
          onComplete={complete}
          onUncomplete={uncomplete}
          onDuplicate={duplicate}
          onDelete={remove}
        />
      ))}

      {completed.length > 0 && (
        <>
          <p className="px-4 py-2 text-xs text-gray-500 uppercase tracking-wide">
            Concluídas ({completed.length})
          </p>
          {completed.map((task) => (
            <PlannedTaskItem
              key={task.id}
              task={task}
              dateISO={today}
              projects={projects}
              categories={categories}
              onPlay={handlePlay}
              onComplete={complete}
              onUncomplete={uncomplete}
              onDuplicate={duplicate}
              onDelete={remove}
            />
          ))}
        </>
      )}
    </div>
  );
}
