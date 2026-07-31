import type { PlannedTask } from "@domain/entities/PlannedTask";
import type { Task } from "@domain/entities/Task";
import { Omnibox } from "@presentation/components/Omnibox";
import { PlannedTasksSection } from "@presentation/components/PlannedTasksSection";
import { TodayEntriesSection } from "@presentation/components/TodayEntriesSection";
import { TotalsSection } from "@presentation/components/TotalsSection";
import { useAppConfig } from "@presentation/contexts/ConfigContext";
import { useRunningTask } from "@presentation/hooks/useRunningTask";
import { useTour } from "@presentation/hooks/useTour";
import { useCategories } from "@presentation/hooks/useCategories";
import { usePlannedTasksForDate } from "@presentation/hooks/usePlannedTasks";
import { useProjects } from "@presentation/hooks/useProjects";
import { useTasks } from "@presentation/hooks/useTasks";
import { useEffect } from "react";
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
    await startTask({
      name: task.name,
      projectId: task.projectId,
      categoryId: task.categoryId,
      billable: task.billable,
      plannedTaskId: task.id,
      customValues: task.customValues,
    });
    await reloadPlanned();
  }

  const { startTour, hasSeenTour } = useTour("tasks");

  useEffect(() => {
    if (!hasSeenTour) {
      const t = setTimeout(() => startTour(), 400);
      return () => clearTimeout(t);
    }
  }, [hasSeenTour]); // eslint-disable-line react-hooks/exhaustive-deps

  const totalToday = totals.billableSeconds + totals.nonBillableSeconds;

  return (
    <div className="h-full flex flex-col gap-4 p-5 overflow-y-auto">
      {/* Greeting */}
      <div data-tour="tasks-greeting" className="flex items-start justify-between gap-2">
        <div className="flex flex-col gap-0.5">
          <h1 className="text-base font-semibold text-gray-100">
            {greet}
            {userName ? `, ${userName}` : ""}!
          </h1>
          <p className="text-xs text-gray-500">No que iremos trabalhar hoje?</p>
        </div>
        <button
          onClick={() => startTour()}
          title="Ver tour da página"
          className="w-5 h-5 shrink-0 rounded-full border border-gray-700 text-gray-600 hover:border-gray-500 hover:text-gray-400 transition-colors text-[11px] font-medium flex items-center justify-center mt-0.5"
        >
          ?
        </button>
      </div>

      {/* Omnibox — idle or running */}
      <div data-tour="tasks-omnibox">
        <Omnibox
          plannedTasks={plannedTasks}
          recentTasks={recentTasks}
          projects={projects}
          categories={categories}
          onStarted={reloadPlanned}
          focusTaskEdit={focusTaskEdit}
          onFocusTaskEditHandled={onFocusTaskEditHandled}
        />
      </div>

      <div data-tour="tasks-planned-section">
        <PlannedTasksSection
          tasks={plannedTasks}
          projects={projects}
          dateISO={today}
          playDisabled={!!runningTask}
          onPlay={handlePlayPlanned}
        />
      </div>

      <div data-tour="tasks-totals">
        <TotalsSection
          billableSeconds={totals.billableSeconds}
          nonBillableSeconds={totals.nonBillableSeconds}
          weekSeconds={totals.weekSeconds}
          weekDays={totals.weekDays}
        />
      </div>

      <div data-tour="tasks-entries">
        <TodayEntriesSection
          groups={groups}
          projects={projects}
          categories={categories}
          reload={reload}
          totalSeconds={totalToday}
        />
      </div>
    </div>
  );
}
