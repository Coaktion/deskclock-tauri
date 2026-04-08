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
