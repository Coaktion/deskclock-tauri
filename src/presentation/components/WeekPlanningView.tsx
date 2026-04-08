import { useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useProjects } from "@presentation/hooks/useProjects";
import { useCategories } from "@presentation/hooks/useCategories";
import { usePlannedTasksForWeek } from "@presentation/hooks/usePlannedTasks";
import { useRunningTask } from "@presentation/contexts/RunningTaskContext";
import { PlannedTaskForm } from "@presentation/components/PlannedTaskForm";
import { PlannedTaskItem } from "@presentation/components/PlannedTaskItem";
import type { PlannedTask } from "@domain/entities/PlannedTask";

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

type DayFilter = "all" | string; // "all" ou ISO date

export function WeekPlanningView() {
  const [weekOffset, setWeekOffset] = useState(0);
  const [dayFilter, setDayFilter] = useState<DayFilter>("all");
  const { start, end, label } = getWeekBounds(weekOffset);
  const days = getDaysOfWeek(start);

  const { projects } = useProjects();
  const { categories } = useCategories();
  const { tasks, reload, create, update, remove, complete, uncomplete, duplicate } =
    usePlannedTasksForWeek(start, end);
  const { startTask } = useRunningTask();

  async function handlePlay(task: PlannedTask) {
    await startTask({
      name: task.name,
      projectId: task.projectId,
      categoryId: task.categoryId,
      billable: task.billable,
    });
    await reload();
  }

  const filteredDays = dayFilter === "all" ? days : [dayFilter];

  return (
    <div className="flex flex-col">
      {/* Header de navegação */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-700">
        <button
          onClick={() => { setWeekOffset((o) => o - 1); setDayFilter("all"); }}
          className="p-1.5 text-gray-400 hover:text-gray-200 hover:bg-gray-700 rounded transition-colors"
        >
          <ChevronLeft size={16} />
        </button>
        <span className="text-sm text-gray-300 font-medium">{label}</span>
        <button
          onClick={() => { setWeekOffset((o) => o + 1); setDayFilter("all"); }}
          className="p-1.5 text-gray-400 hover:text-gray-200 hover:bg-gray-700 rounded transition-colors"
        >
          <ChevronRight size={16} />
        </button>
      </div>

      {/* Filtros rápidos de dia */}
      <div className="flex gap-1 px-4 py-2 border-b border-gray-700 overflow-x-auto">
        <button
          onClick={() => setDayFilter("all")}
          className={`px-2.5 py-1 text-xs rounded transition-colors whitespace-nowrap ${
            dayFilter === "all"
              ? "bg-blue-900/40 text-blue-300 border border-blue-600"
              : "bg-gray-800 text-gray-400 border border-gray-700 hover:text-gray-200"
          }`}
        >
          Todos
        </button>
        {days.map((day, i) => (
          <button
            key={day}
            onClick={() => setDayFilter((prev) => (prev === day ? "all" : day))}
            className={`px-2.5 py-1 text-xs rounded transition-colors whitespace-nowrap ${
              dayFilter === day
                ? "bg-blue-900/40 text-blue-300 border border-blue-600"
                : "bg-gray-800 text-gray-400 border border-gray-700 hover:text-gray-200"
            }`}
          >
            {DAY_SHORT[(i + 1) % 7]}
          </button>
        ))}
      </div>

      {/* Formulário */}
      <PlannedTaskForm
        key={dayFilter !== "all" ? dayFilter : start}
        projects={projects}
        categories={categories}
        showDateFields={true}
        defaultDate={dayFilter !== "all" ? dayFilter : start}
        onSubmit={create}
      />

      {/* Lista agrupada por dia */}
      {filteredDays.map((day) => {
        const dayTasks = tasks.filter((t) => isTaskOnDate(t, day));
        if (dayTasks.length === 0 && dayFilter !== "all") return null;

        const dayDate = new Date(day + "T12:00:00Z");
        const dayLabel = `${DAY_SHORT[dayDate.getUTCDay()]}, ${String(dayDate.getUTCDate()).padStart(2, "0")}/${String(dayDate.getUTCMonth() + 1).padStart(2, "0")}`;

        return (
          <div key={day}>
            <div className="flex items-center gap-2 px-4 py-2 bg-gray-900 border-b border-gray-800">
              <span className="text-xs font-medium text-gray-400 uppercase tracking-wide">
                {dayLabel}
              </span>
              {dayTasks.length > 0 && (
                <span className="text-xs text-gray-600">({dayTasks.length})</span>
              )}
            </div>
            {dayTasks.length === 0 ? (
              <p className="px-4 py-2 text-xs text-gray-600 italic">Nenhuma tarefa</p>
            ) : (
              dayTasks.map((task) => (
                <PlannedTaskItem
                  key={task.id}
                  task={task}
                  dateISO={day}
                  projects={projects}
                  categories={categories}
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
