import type { PlannedTask } from "@domain/entities/PlannedTask";
import type { Task } from "@domain/entities/Task";
import { Omnibox } from "@presentation/components/Omnibox";
import { PlannedTasksSection } from "@presentation/components/PlannedTasksSection";
import { TodayEntriesSection } from "@presentation/components/TodayEntriesSection";
import { TotalsSection } from "@presentation/components/TotalsSection";
import { useAppConfig } from "@presentation/contexts/ConfigContext";
import { useRunningTask } from "@presentation/contexts/RunningTaskContext";
import { useCategories } from "@presentation/hooks/useCategories";
import { usePlannedTasksForDate } from "@presentation/hooks/usePlannedTasks";
import { useProjects } from "@presentation/hooks/useProjects";
import { useTasks } from "@presentation/hooks/useTasks";
import { executeActions } from "@shared/utils/actions";
import { openInBrowser, openInFileManager } from "@shared/utils/shell";
import { todayISO } from "@shared/utils/time";

interface TasksPageProps {
  focusTaskEdit?: boolean;
  onFocusTaskEditHandled?: () => void;
}

export function TasksPage({ focusTaskEdit, onFocusTaskEditHandled }: TasksPageProps = {}) {
  const today = todayISO();
  const { projects } = useProjects();
  const { categories } = useCategories();
  const { groups, totals, reload } = useTasks();
  const { startTask, runningTask } = useRunningTask();
  const { tasks: plannedTasks, reload: reloadPlanned } = usePlannedTasksForDate(today);
  const config = useAppConfig();

  const hour = new Date().getHours();
  const greet = hour < 12 ? "Bom dia" : hour < 18 ? "Boa tarde" : "Boa noite";
  const userName = config.get("userName");

  // Recent tasks: unique by name+projectId, up to 8, from today's entries (most recent first)
  const recentTasks: Task[] = (() => {
    const all = groups.flatMap((g) => g.tasks);
    const seen = new Set<string>();
    const result: Task[] = [];
    for (let i = all.length - 1; i >= 0; i--) {
      const t = all[i];
      const key = `${t.name ?? ""}|${t.projectId ?? ""}`;
      if (!seen.has(key)) {
        seen.add(key);
        result.push(t);
        if (result.length >= 8) break;
      }
    }
    return result;
  })();

  async function handlePlayPlanned(task: PlannedTask) {
    if (runningTask) return;
    await executeActions(task.actions, { openUrl: openInBrowser, openPath: openInFileManager });
    await startTask({
      name: task.name,
      projectId: task.projectId,
      categoryId: task.categoryId,
      billable: task.billable,
      plannedTaskId: task.id,
    });
    await reloadPlanned();
  }

  const totalToday = totals.billableSeconds + totals.nonBillableSeconds;

  return (
    <div className="h-full flex flex-col gap-4 p-5 overflow-y-auto">
      {/* Greeting */}
      <div className="flex flex-col gap-0.5">
        <h1 className="text-base font-semibold text-gray-100">
          {greet}{userName ? `, ${userName}` : ""}!
        </h1>
        <p className="text-xs text-gray-500">No que iremos trabalhar hoje?</p>
      </div>

      {/* Omnibox — idle or running */}
      <Omnibox
        plannedTasks={plannedTasks}
        recentTasks={recentTasks}
        projects={projects}
        categories={categories}
        onStarted={reloadPlanned}
        focusTaskEdit={focusTaskEdit}
        onFocusTaskEditHandled={onFocusTaskEditHandled}
      />

      <PlannedTasksSection
        tasks={plannedTasks}
        projects={projects}
        dateISO={today}
        playDisabled={!!runningTask}
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
