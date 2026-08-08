import type { PlannedTask } from "@domain/entities/PlannedTask";
import { deletePlannedTask } from "@domain/usecases/plannedTasks/DeletePlannedTask";
import { CollapsibleFormColumn } from "@presentation/components/CollapsibleFormColumn";
import { PlannedTaskForm } from "@presentation/components/PlannedTaskForm";
import { PlannedTaskItem } from "@presentation/components/PlannedTaskItem";
import { FilterPill, PageHeader } from "@presentation/components/ui";
import { useRepositories } from "@presentation/contexts/RepositoriesContext";
import { useCategories } from "@presentation/hooks/useCategories";
import { usePlannedTasksForWeek } from "@presentation/hooks/usePlannedTasks";
import { usePersistedFlag } from "@presentation/hooks/usePersistedFlag";
import { useProjects } from "@presentation/hooks/useProjects";
import { useRunningTask } from "@presentation/hooks/useRunningTask";
import { useTour } from "@presentation/hooks/useTour";
import { useTrackedMeetingTitles } from "@presentation/hooks/useTrackedMeetingTitles";
import { OVERLAY_EVENTS } from "@shared/types/overlayEvents";
import { todayISO } from "@shared/utils/time";
import { emit } from "@tauri-apps/api/event";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

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
  const { plannedTaskRepo } = useRepositories();
  const [weekOffset, setWeekOffset] = useState(0);
  const [dayFilter, setDayFilter] = useState<DayFilter>("all");
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const { start, end, label } = getWeekBounds(weekOffset);
  const days = getDaysOfWeek(start);
  const today = todayISO();

  const { projects } = useProjects();
  const { categories } = useCategories();
  const { tasks, reload, create, update, remove, complete, uncomplete, duplicate } =
    usePlannedTasksForWeek(start, end);
  const { startTask, runningTask } = useRunningTask();
  const { titles: trackedTitles, today: trackedToday } = useTrackedMeetingTitles();

  const formColumn = usePersistedFlag("planningFormCollapsed");

  // A semana é sempre útil: sábado e domingo saíram de vez, junto com a
  // configuração que os ligava. Tarefas recorrentes gravadas no fim de semana
  // continuam no banco, mas não têm mais dia onde aparecer.
  const visibleDays = days.filter((d) => {
    const dow = new Date(d + "T12:00:00Z").getUTCDay();
    return dow !== 0 && dow !== 6;
  });

  // Stats: total task-day pairs + completed ones for the visible week
  const { totalCount, completedCount } = useMemo(() => {
    let total = 0;
    let completed = 0;
    for (const day of visibleDays) {
      for (const task of tasks) {
        if (isTaskOnDate(task, day)) {
          total++;
          if (task.completedDates.includes(day)) completed++;
        }
      }
    }
    return { totalCount: total, completedCount: completed };
  }, [tasks, visibleDays]);

  async function handlePlay(task: PlannedTask) {
    if (runningTask) return;
    await startTask({
      name: task.name,
      projectId: task.projectId,
      categoryId: task.categoryId,
      billable: task.billable,
      plannedTaskId: task.id,
      customValues: task.customValues,
    });
    await reload();
  }

  function toggleSelectTask(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function exitSelectMode() {
    setSelectMode(false);
    setSelectedIds(new Set());
  }

  async function handleBulkDelete() {
    for (const id of selectedIds) {
      await deletePlannedTask(plannedTaskRepo, id);
    }
    await reload();
    await emit(OVERLAY_EVENTS.PLANNED_TASKS_CHANGED, {});
    exitSelectMode();
  }

  const { startTour, hasSeenTour } = useTour("planning");

  useEffect(() => {
    if (!hasSeenTour) {
      const t = setTimeout(() => startTour(), 400);
      return () => clearTimeout(t);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const filteredDays = dayFilter === "all" ? visibleDays : [dayFilter];

  const allVisibleTaskIds = useMemo(() => {
    const ids = new Set<string>();
    for (const day of filteredDays) {
      for (const task of tasks) {
        if (isTaskOnDate(task, day)) ids.add(task.id);
      }
    }
    return ids;
  }, [tasks, filteredDays]);

  function toggleSelectAllForDay(day: string) {
    const dayTaskIds = tasks.filter((t) => isTaskOnDate(t, day)).map((t) => t.id);
    const allSelected = dayTaskIds.length > 0 && dayTaskIds.every((id) => selectedIds.has(id));
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (allSelected) dayTaskIds.forEach((id) => next.delete(id));
      else dayTaskIds.forEach((id) => next.add(id));
      return next;
    });
  }

  return (
    <div className="h-full flex flex-col">
      <PageHeader
        title="Planejamento"
        tourId="planning-header"
        onStartTour={startTour}
        context={
          <div className="flex items-center gap-2 min-w-0">
            <button
              onClick={() => {
                setWeekOffset((o) => o - 1);
                setDayFilter("all");
              }}
              className="p-1.5 text-fg-muted hover:text-fg hover:bg-raised rounded-control transition-colors shrink-0"
            >
              <ChevronLeft size={15} />
            </button>

            <span className="text-sm font-medium text-fg truncate">{label}</span>

            <button
              onClick={() => {
                setWeekOffset((o) => o + 1);
                setDayFilter("all");
              }}
              className="p-1.5 text-fg-muted hover:text-fg hover:bg-raised rounded-control transition-colors shrink-0"
            >
              <ChevronRight size={15} />
            </button>

            {/* Volta para a semana atual e, ao mesmo tempo, diz quando se está nela:
                navegando algumas semanas, o intervalo em dd/mm não responde sozinho
                "é esta?". Aceso, é a resposta; apagado, é o caminho de volta. Segue
                o mesmo vocabulário da pílula "Hoje" do formulário, que faz o
                equivalente para o campo de data. */}
            <FilterPill
              size="sm"
              active={weekOffset === 0}
              onClick={() => {
                setWeekOffset(0);
                setDayFilter("all");
              }}
              title="Voltar para a semana atual"
            >
              Semana atual
            </FilterPill>
          </div>
        }
        actions={
          <span className="text-xs text-fg-secondary whitespace-nowrap">
            {completedCount} de {totalCount} concluídas
          </span>
        }
      />

      {/* Formulário à esquerda, semana à direita — mesmo arranjo do Lançamento
          Manual, para as duas telas de entrada não parecerem coisas distintas. */}
      <div className="flex-1 min-h-0 flex">
        {/* A `key` remonta o formulário para ele reler o `defaultDate`. Os dois
            ramos são prefixados de propósito: sem isso, "all" usa a data de
            início da semana — que é a segunda-feira — e filtrar por segunda
            gera a mesma chave, o formulário não remonta e o campo Data fica
            preso no valor anterior. O bug só aparecia na segunda. */}
        <CollapsibleFormColumn
          collapsed={formColumn.value}
          onToggle={formColumn.toggle}
          label="Nova tarefa"
          widthKey="planningFormWidth"
          tourId="planning-form"
        >
          <PlannedTaskForm
            key={dayFilter === "all" ? `week-${start}` : `day-${dayFilter}`}
            projects={projects}
            categories={categories}
            showDateFields={true}
            defaultDate={dayFilter !== "all" ? dayFilter : today}
            onSubmit={create}
          />
        </CollapsibleFormColumn>

        <div className="flex-1 min-w-0 flex flex-col">
          {/* ── Dias da semana + seleção, na mesma linha ──────────────────────
              Cabem juntos desde que o fim de semana saiu: cinco pílulas e
              "Todos" deixam folga à direita, e a barra de seleção sozinha numa
              linha custava altura que é da lista. A rolagem horizontal fica só
              no grupo das pílulas — arrastando a linha inteira, os botões de
              seleção sairiam da tela junto. */}
          <div
            data-tour="planning-day-filter"
            className="border-b border-gray-800 shrink-0 flex items-center gap-3 px-4 py-2.5"
          >
            {/* O padding de 2px acomoda o ponto de "hoje", que sai 2px para fora
                da pílula: sendo hoje o último dia visível, esses 2px viravam
                área rolável e a barra horizontal aparecia com a linha inteira
                cabendo na tela. A margem negativa devolve o espaço, então nada
                se desloca — e o padding no topo é o que impede o ponto de ser
                cortado pelo próprio overflow. */}
            <div className="flex gap-1.5 min-w-0 overflow-x-auto pt-0.5 pr-0.5 -mt-0.5 -mr-0.5">
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
              {visibleDays.map((day) => {
                const isToday = day === today;
                const dow = new Date(day + "T12:00:00Z").getUTCDay();
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
                    {DAY_SHORT[dow]}
                    {isToday && (
                      <span className="absolute -top-0.5 -right-0.5 w-1.5 h-1.5 bg-blue-500 rounded-full" />
                    )}
                  </button>
                );
              })}
            </div>

            {/* Age sobre a lista da semana, não sobre o header — que já disputa
                espaço com a navegação de semana e o contador de concluídas. */}
            {totalCount > 0 && (
              <div className="ml-auto shrink-0 flex items-center gap-3">
                {selectMode ? (
                  <>
                    <button
                      onClick={() => {
                        const allSelected =
                          allVisibleTaskIds.size > 0 && selectedIds.size >= allVisibleTaskIds.size;
                        setSelectedIds(allSelected ? new Set() : new Set(allVisibleTaskIds));
                      }}
                      className="text-xs text-gray-400 hover:text-gray-200 transition-colors"
                    >
                      {allVisibleTaskIds.size > 0 && selectedIds.size >= allVisibleTaskIds.size
                        ? "Desmarcar todas"
                        : "Selecionar todas"}
                    </button>
                    <button
                      onClick={() => void handleBulkDelete()}
                      disabled={selectedIds.size === 0}
                      className="text-xs text-red-400 hover:text-red-300 disabled:text-gray-600 disabled:cursor-not-allowed transition-colors"
                    >
                      Excluir{selectedIds.size > 0 ? ` (${selectedIds.size})` : ""}
                    </button>
                    <button
                      onClick={exitSelectMode}
                      className="text-xs text-gray-500 hover:text-gray-300 transition-colors"
                    >
                      Cancelar
                    </button>
                  </>
                ) : (
                  <button
                    onClick={() => setSelectMode(true)}
                    className="text-xs text-gray-400 hover:border-gray-500 hover:text-gray-200 rounded-lg transition-colors"
                  >
                    Selecionar tarefas
                  </button>
                )}
              </div>
            )}
          </div>

          {/* ── Task list grouped by day ────────────────────────────────────── */}
          <div data-tour="planning-task-list" className="flex-1 min-h-0 overflow-y-auto">
            {filteredDays.map((day) => {
              const dayTasks = tasks.filter((t) => isTaskOnDate(t, day));
              if (dayTasks.length === 0 && dayFilter !== "all") return null;

              const dayDate = new Date(day + "T12:00:00Z");
              const isToday = day === today;
              const dayLabel = `${DAY_SHORT[dayDate.getUTCDay()]}, ${String(dayDate.getUTCDate()).padStart(2, "0")}/${String(dayDate.getUTCMonth() + 1).padStart(2, "0")}`;
              const dayCompleted = dayTasks.filter((t) => t.completedDates.includes(day)).length;

              return (
                <div key={day}>
                  <div
                    className={`flex items-center gap-2 px-4 py-2.5 border-b border-gray-800 ${isToday ? "bg-blue-500/5" : "bg-gray-900/60"}`}
                  >
                    <span
                      className={`text-xs font-semibold uppercase tracking-widest ${isToday ? "text-blue-400" : "text-gray-400"}`}
                    >
                      {dayLabel}
                      {isToday && (
                        <span className="ml-1.5 normal-case font-medium text-blue-400/70">
                          hoje
                        </span>
                      )}
                    </span>
                    <div className="ml-auto flex items-center gap-2">
                      {selectMode && dayTasks.length > 0 && (
                        <button
                          onClick={() => toggleSelectAllForDay(day)}
                          className="text-xs text-gray-500 hover:text-gray-300 transition-colors"
                        >
                          {dayTasks.every((t) => selectedIds.has(t.id))
                            ? "Desmarcar"
                            : "Selecionar"}
                        </button>
                      )}
                      {dayTasks.length > 0 && (
                        <span className="text-xs font-medium text-gray-500 bg-gray-800 rounded-full px-1.5 py-0.5 leading-none">
                          {dayCompleted > 0
                            ? `${dayCompleted}/${dayTasks.length}`
                            : dayTasks.length}
                        </span>
                      )}
                    </div>
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
                        tracked={
                          day === trackedToday && trackedTitles.has(task.name.toLowerCase().trim())
                        }
                        onPlay={handlePlay}
                        onUpdate={update}
                        onComplete={complete}
                        onUncomplete={uncomplete}
                        onDuplicate={duplicate}
                        onDelete={remove}
                        selectMode={selectMode}
                        selected={selectedIds.has(task.id)}
                        onToggleSelect={toggleSelectTask}
                      />
                    ))
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
