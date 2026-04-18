import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, CalendarDays } from "lucide-react";
import { emit } from "@tauri-apps/api/event";
import { useProjects } from "@presentation/hooks/useProjects";
import { useCategories } from "@presentation/hooks/useCategories";
import { usePlannedTasksForWeek } from "@presentation/hooks/usePlannedTasks";
import { useRunningTask } from "@presentation/contexts/RunningTaskContext";
import { useAppConfig } from "@presentation/contexts/ConfigContext";
import { PlannedTaskForm } from "@presentation/components/PlannedTaskForm";
import { PlannedTaskItem } from "@presentation/components/PlannedTaskItem";
import { ImportCalendarModal } from "@presentation/modals/ImportCalendarModal";
import { GoogleCalendarImporter } from "@infra/integrations/GoogleCalendarImporter";
import { PlannedTaskRepository } from "@infra/database/PlannedTaskRepository";
import { OVERLAY_EVENTS } from "@shared/types/overlayEvents";
import { executeActions } from "@shared/utils/actions";
import { openInBrowser, openInFileManager } from "@shared/utils/shell";
import { todayISO } from "@shared/utils/time";
import type { PlannedTask } from "@domain/entities/PlannedTask";

const plannedRepo = new PlannedTaskRepository();

const DAY_SHORT = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

function getWeekBounds(offset: number): { start: string; end: string; label: string } {
  const today = new Date();
  const dow = today.getDay();
  const diffToMon = dow === 0 ? -6 : 1 - dow;
  const mon = new Date(today);
  mon.setDate(today.getDate() + diffToMon + offset * 7);
  const sun = new Date(mon);
  sun.setDate(mon.getDate() + 6);

  const fmt = (d: Date) => {
    const y = d.getFullYear();
    const mo = String(d.getMonth() + 1).padStart(2, "0");
    const da = String(d.getDate()).padStart(2, "0");
    return `${y}-${mo}-${da}`;
  };

  const fmtLabel = (d: Date) =>
    `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}`;

  return {
    start: fmt(mon),
    end: fmt(sun),
    label: `${fmtLabel(mon)} — ${fmtLabel(sun)}/${sun.getFullYear()}`,
  };
}

function getDaysOfWeek(start: string): string[] {
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(start + "T12:00:00Z");
    d.setUTCDate(d.getUTCDate() + i);
    return d.toISOString().slice(0, 10);
  });
}

function isTaskOnDate(task: PlannedTask, dateISO: string): boolean {
  if (task.scheduleType === "specific_date") return task.scheduleDate === dateISO;
  if (task.scheduleType === "recurring") {
    const dayOfWeek = new Date(dateISO + "T12:00:00Z").getUTCDay();
    return Array.isArray(task.recurringDays) && task.recurringDays.includes(dayOfWeek);
  }
  if (task.scheduleType === "period") {
    const start = task.periodStart ?? "";
    const end = task.periodEnd ?? "9999-99-99";
    return dateISO >= start && dateISO <= end;
  }
  return false;
}

type DayFilter = "all" | string;

export function WeekPlanningView() {
  const [weekOffset, setWeekOffset] = useState(0);
  const [dayFilter, setDayFilter] = useState<DayFilter>("all");
  const [showImportModal, setShowImportModal] = useState(false);
  const { start, end, label } = getWeekBounds(weekOffset);
  const days = getDaysOfWeek(start);
  const today = todayISO();

  const config = useAppConfig();
  const { projects } = useProjects();
  const { categories } = useCategories();
  const { tasks, reload, create, update, remove, complete, uncomplete, duplicate } =
    usePlannedTasksForWeek(start, end);
  const { startTask, runningTask } = useRunningTask();

  const calendarConnected = config.isLoaded && !!config.get("googleRefreshToken");

  const calendarImporter = useMemo(
    () => (config.isLoaded ? new GoogleCalendarImporter(config) : null),
    [config.isLoaded] // eslint-disable-line react-hooks/exhaustive-deps
  );

  const calendarFromISO = new Date(start + "T00:00:00").toISOString();
  const calendarToISO = new Date(end + "T23:59:59").toISOString();

  // Stats: total task-day pairs + completed ones for the visible week
  const { totalCount, completedCount } = useMemo(() => {
    let total = 0;
    let completed = 0;
    for (const day of days) {
      for (const task of tasks) {
        if (isTaskOnDate(task, day)) {
          total++;
          if (task.completedDates.includes(day)) completed++;
        }
      }
    }
    return { totalCount: total, completedCount: completed };
  }, [tasks, days]);

  async function handlePlay(task: PlannedTask) {
    if (runningTask) return;
    await executeActions(task.actions, { openUrl: openInBrowser, openPath: openInFileManager });
    await startTask({
      name: task.name,
      projectId: task.projectId,
      categoryId: task.categoryId,
      billable: task.billable,
      plannedTaskId: task.id,
    });
    await reload();
  }

  function handleImported(count: number) {
    setShowImportModal(false);
    if (count > 0) {
      reload();
      emit(OVERLAY_EVENTS.PLANNED_TASKS_CHANGED, {});
    }
  }

  const filteredDays = dayFilter === "all" ? days : [dayFilter];

  return (
    <div className="flex flex-col">
      {/* ── Header: week selector + completed count ─────────────────────────── */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-800">
        <button
          onClick={() => { setWeekOffset((o) => o - 1); setDayFilter("all"); }}
          className="p-1.5 text-gray-500 hover:text-gray-200 hover:bg-gray-800 rounded-lg transition-colors shrink-0"
        >
          <ChevronLeft size={15} />
        </button>

        <span className="text-sm font-medium text-gray-100 truncate">{label}</span>

        <button
          onClick={() => { setWeekOffset((o) => o + 1); setDayFilter("all"); }}
          className="p-1.5 text-gray-500 hover:text-gray-200 hover:bg-gray-800 rounded-lg transition-colors shrink-0"
        >
          <ChevronRight size={15} />
        </button>

        {calendarConnected && (
          <button
            onClick={() => setShowImportModal(true)}
            title="Importar do Google Calendar"
            className="p-1.5 text-gray-500 hover:text-blue-400 hover:bg-gray-800 rounded-lg transition-colors shrink-0"
          >
            <CalendarDays size={13} />
          </button>
        )}

        <span className="ml-auto text-xs text-gray-400 shrink-0 whitespace-nowrap">
          {completedCount} de {totalCount} concluídas
        </span>
      </div>

      {/* ── Day filter pills ─────────────────────────────────────────────────── */}
      <div className="flex gap-1.5 px-4 py-2.5 border-b border-gray-800 overflow-x-auto">
        <button
          onClick={() => setDayFilter("all")}
          className={`px-3 py-1.5 text-xs rounded-full border transition-colors whitespace-nowrap ${
            dayFilter === "all"
              ? "bg-blue-500/10 border-blue-500/40 text-blue-400"
              : "bg-transparent border-gray-700 text-gray-400 hover:border-gray-600 hover:text-gray-300"
          }`}
        >
          Todos
        </button>
        {days.map((day, i) => {
          const isToday = day === today;
          return (
            <button
              key={day}
              onClick={() => setDayFilter((prev) => (prev === day ? "all" : day))}
              className={`px-3 py-1.5 text-xs rounded-full border transition-colors whitespace-nowrap relative ${
                dayFilter === day
                  ? "bg-blue-500/10 border-blue-500/40 text-blue-400"
                  : isToday
                    ? "bg-transparent border-blue-500/20 text-gray-300 hover:border-blue-500/40"
                    : "bg-transparent border-gray-700 text-gray-400 hover:border-gray-600 hover:text-gray-300"
              }`}
            >
              {DAY_SHORT[(i + 1) % 7]}
              {isToday && (
                <span className="absolute -top-0.5 -right-0.5 w-1.5 h-1.5 bg-blue-500 rounded-full" />
              )}
            </button>
          );
        })}
      </div>

      {/* ── Form ─────────────────────────────────────────────────────────────── */}
      <PlannedTaskForm
        key={dayFilter !== "all" ? dayFilter : start}
        projects={projects}
        categories={categories}
        showDateFields={true}
        defaultDate={dayFilter !== "all" ? dayFilter : today}
        onSubmit={create}
      />

      {/* ── Google Calendar import modal ─────────────────────────────────────── */}
      {showImportModal && calendarImporter && (
        <ImportCalendarModal
          importer={calendarImporter}
          repo={plannedRepo}
          fromISO={calendarFromISO}
          toISO={calendarToISO}
          weekLabel={label}
          projects={projects}
          categories={categories}
          onImported={handleImported}
          onClose={() => setShowImportModal(false)}
        />
      )}

      {/* ── Task list grouped by day ──────────────────────────────────────────── */}
      {filteredDays.map((day) => {
        const dayTasks = tasks.filter((t) => isTaskOnDate(t, day));
        if (dayTasks.length === 0 && dayFilter !== "all") return null;

        const dayDate = new Date(day + "T12:00:00Z");
        const isToday = day === today;
        const dayLabel = `${DAY_SHORT[dayDate.getUTCDay()]}, ${String(dayDate.getUTCDate()).padStart(2, "0")}/${String(dayDate.getUTCMonth() + 1).padStart(2, "0")}`;
        const dayCompleted = dayTasks.filter((t) => t.completedDates.includes(day)).length;

        return (
          <div key={day}>
            <div className={`flex items-center gap-2 px-4 py-2.5 border-b border-gray-800 ${isToday ? "bg-blue-500/5" : "bg-gray-900/60"}`}>
              <span className={`text-[11px] font-semibold uppercase tracking-widest ${isToday ? "text-blue-400" : "text-gray-400"}`}>
                {dayLabel}
                {isToday && <span className="ml-1.5 normal-case font-medium text-blue-400/70">hoje</span>}
              </span>
              {dayTasks.length > 0 && (
                <span className="text-[10px] font-medium text-gray-500 bg-gray-800 rounded-full px-1.5 py-0.5 leading-none">
                  {dayCompleted > 0 ? `${dayCompleted}/${dayTasks.length}` : dayTasks.length}
                </span>
              )}
            </div>
            {dayTasks.length === 0 ? (
              <p className="px-4 py-3 text-xs text-gray-600">Nenhuma tarefa planejada</p>
            ) : (
              dayTasks.map((task) => (
                <PlannedTaskItem
                  key={task.id}
                  task={task}
                  dateISO={day}
                  projects={projects}
                  categories={categories}
                  playDisabled={!!runningTask}
                  onPlay={handlePlay}
                  onUpdate={update}
                  onComplete={complete}
                  onUncomplete={uncomplete}
                  onDuplicate={duplicate}
                  onDelete={remove}
                />
              ))
            )}
          </div>
        );
      })}
    </div>
  );
}
