import type { PlannedTask } from "@domain/entities/PlannedTask";
import type { Task } from "@domain/entities/Task";
import { pendingPlannedTasks } from "@domain/utils/plannedPending";
import { Omnibox } from "@presentation/components/Omnibox";
import { PlannedTasksSection } from "@presentation/components/PlannedTasksSection";
import { TodayEntriesSection } from "@presentation/components/TodayEntriesSection";
import { TotalsSection } from "@presentation/components/TotalsSection";
import { PageHeader } from "@presentation/components/ui";
import { useAppConfig } from "@presentation/contexts/ConfigContext";
import { useRunningTask } from "@presentation/hooks/useRunningTask";
import { useTour } from "@presentation/hooks/useTour";
import { useCategories } from "@presentation/hooks/useCategories";
import { usePlannedTasksForDate } from "@presentation/hooks/usePlannedTasks";
import { useProjects } from "@presentation/hooks/useProjects";
import { useTasks } from "@presentation/hooks/useTasks";
import { useEffect } from "react";
import { formatHHMMSS, todayISO } from "@shared/utils/time";

interface TasksPageProps {
  focusTaskEdit?: boolean;
  onFocusTaskEditHandled?: () => void;
  /** Destino do "Ver semana →" das planejadas. */
  onNavigatePlanning?: () => void;
}

export function TasksPage({
  focusTaskEdit,
  onFocusTaskEditHandled,
  onNavigatePlanning,
}: TasksPageProps = {}) {
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
  /** Governa o arranjo da linha do meio, não só a presença da lista. */
  const hasPlanned = pendingPlannedTasks(plannedTasks, today).length > 0;

  return (
    <div className="h-full flex flex-col">
      <PageHeader
        title="Tarefas"
        context={
          <span className="min-w-0 truncate text-sm text-fg-muted">
            {greet}
            {userName ? `, ${userName}` : ""} ·{" "}
            <span className="font-mono tabular-nums text-fg-secondary">
              {formatHHMMSS(totalToday)}
            </span>{" "}
            hoje
          </span>
        }
        onStartTour={startTour}
        tourId="tasks-greeting"
      />

      <div className="flex-1 min-h-0 overflow-y-auto flex flex-col gap-5 p-5">
        {/* Omnibox — idle or running */}
        <div data-tour="tasks-omnibox" className="shrink-0">
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

        {/* Planejadas e KPI dividem uma linha só. Sem planejadas a faixa fica
            sozinha e o `flex-1` já lhe dá a largura toda — daí ela trocar de
            arranjo junto, ou seriam quatro cartões em metade da tela. */}
        <div className="shrink-0 flex gap-5 items-start">
          {hasPlanned && (
            <div data-tour="tasks-planned-section" className="flex-1 min-w-0">
              <PlannedTasksSection
                tasks={plannedTasks}
                projects={projects}
                dateISO={today}
                playDisabled={!!runningTask}
                onPlay={handlePlayPlanned}
                onNavigatePlanning={onNavigatePlanning}
              />
            </div>
          )}
          <div data-tour="tasks-totals" className="flex-1 min-w-0">
            <TotalsSection
              billableSeconds={totals.billableSeconds}
              nonBillableSeconds={totals.nonBillableSeconds}
              weekSeconds={totals.weekSeconds}
              weekDays={totals.weekDays}
              layout={hasPlanned ? "grid" : "row"}
            />
          </div>
        </div>

        {/* A seção cresce só até caber o que lista. O `shrink-0` é o que a
            impede de ser espremida quando o corpo passa a rolar. */}
        <div data-tour="tasks-entries" className="shrink-0">
          <TodayEntriesSection
            groups={groups}
            projects={projects}
            categories={categories}
            reload={reload}
            totalSeconds={totalToday}
          />
        </div>
      </div>
    </div>
  );
}
