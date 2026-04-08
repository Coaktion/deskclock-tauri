import { Play } from "lucide-react";
import { useProjects } from "@presentation/hooks/useProjects";
import { useCategories } from "@presentation/hooks/useCategories";
import { useTasks } from "@presentation/hooks/useTasks";
import { useRunningTask } from "@presentation/contexts/RunningTaskContext";
import { usePlannedTasksForDate } from "@presentation/hooks/usePlannedTasks";
import { RunningTaskSection } from "@presentation/components/RunningTaskSection";
import { TotalsSection } from "@presentation/components/TotalsSection";
import { TodayEntriesSection } from "@presentation/components/TodayEntriesSection";
import { PlannedTasksSection } from "@presentation/components/PlannedTasksSection";
import { todayISO } from "@shared/utils/time";
import type { PlannedTask } from "@domain/entities/PlannedTask";

export function TasksPage() {
  const today = todayISO();
  const { projects } = useProjects();
  const { categories } = useCategories();
  const { groups, totals, reload } = useTasks();
  const { startTask, runningTask } = useRunningTask();
  const { tasks: plannedTasks, reload: reloadPlanned } = usePlannedTasksForDate(today);

  async function handleNewTask() {
    await startTask({ billable: true });
  }

  async function handlePlayPlanned(task: PlannedTask) {
    await startTask({
      name: task.name,
      projectId: task.projectId,
      categoryId: task.categoryId,
      billable: task.billable,
    });
    await reloadPlanned();
  }

  const totalToday = totals.billableSeconds + totals.nonBillableSeconds;

  return (
    <div className="h-full flex flex-col gap-4 p-5 overflow-y-auto">
      {runningTask ? (
        <RunningTaskSection projects={projects} categories={categories} />
      ) : (
        <button
          onClick={handleNewTask}
          className="flex items-center gap-2 px-4 py-3 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-sm font-medium transition-colors w-full justify-center"
        >
          <Play size={16} />
          Iniciar nova tarefa
        </button>
      )}

      <PlannedTasksSection
        tasks={plannedTasks}
        projects={projects}
        dateISO={today}
        onPlay={handlePlayPlanned}
      />

      <TotalsSection
        billableSeconds={totals.billableSeconds}
        nonBillableSeconds={totals.nonBillableSeconds}
        weekSeconds={totals.weekSeconds}
        weekDays={totals.weekDays}
      />

      <TodayEntriesSection
        groups={groups}
        projects={projects}
        categories={categories}
        reload={reload}
        totalSeconds={totalToday}
      />
    </div>
  );
}
