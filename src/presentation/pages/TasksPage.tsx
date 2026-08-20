import type { PlannedTask } from "@domain/entities/PlannedTask";
import { Omnibox } from "@presentation/components/Omnibox";
import { TodayEntriesSection } from "@presentation/components/TodayEntriesSection";
import { TotalsSection } from "@presentation/components/TotalsSection";
import { PageHeader } from "@presentation/components/ui";
import { useAppConfig } from "@presentation/contexts/ConfigContext";
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
  /** Destino do "Ver semana →" no rodapé da lista de planejadas do omnibox. */
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
  const {
    tasks: plannedTasks,
    reload: reloadPlanned,
    update: updatePlanned,
  } = usePlannedTasksForDate(today);
  const config = useAppConfig();

  const hour = new Date().getHours();
  const greet = hour < 12 ? "Bom dia" : hour < 18 ? "Boa tarde" : "Boa noite";
  const userName = config.get("userName");

  /** O `update` do hook já recarrega a lista e emite PLANNED_TASKS_CHANGED. */
  async function handleTogglePlannedBillable(task: PlannedTask) {
    await updatePlanned(task.id, { billable: !task.billable });
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
            today={today}
            projects={projects}
            categories={categories}
            onStarted={reloadPlanned}
            focusTaskEdit={focusTaskEdit}
            onFocusTaskEditHandled={onFocusTaskEditHandled}
            onTogglePlannedBillable={handleTogglePlannedBillable}
            onNavigatePlanning={onNavigatePlanning}
          />
        </div>

        <div data-tour="tasks-totals" className="shrink-0">
          <TotalsSection
            billableSeconds={totals.billableSeconds}
            nonBillableSeconds={totals.nonBillableSeconds}
            weekSeconds={totals.weekSeconds}
            weekDays={totals.weekDays}
          />
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
