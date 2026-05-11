import type { Category } from "@domain/entities/Category";
import type { PlannedTask } from "@domain/entities/PlannedTask";
import type { Project } from "@domain/entities/Project";
import type { Task } from "@domain/entities/Task";
import { completePlannedTask } from "@domain/usecases/plannedTasks/CompletePlannedTask";
import { createRetroactiveTask } from "@domain/usecases/tasks/CreateRetroactiveTask";
import { deleteTask } from "@domain/usecases/tasks/DeleteTask";
import { useRepositories } from "@presentation/contexts/RepositoriesContext";
import { useTour } from "@presentation/hooks/useTour";
import { Autocomplete } from "@presentation/components/Autocomplete";
import { DatePickerInput } from "@presentation/components/DatePickerInput";
import { useCategories } from "@presentation/hooks/useCategories";
import { useProjects } from "@presentation/hooks/useProjects";
import { useRetroactiveForm } from "@presentation/hooks/useRetroactiveForm";
import { EditTaskModal } from "@presentation/modals/EditTaskModal";
import { addDaysISO, formatHHMMSS, todayISO } from "@shared/utils/time";
import { ChevronLeft, ChevronRight, DollarSign, Pencil, Play, Trash2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";


const DAY_NAMES_PT = [
  "domingo",
  "segunda-feira",
  "terça-feira",
  "quarta-feira",
  "quinta-feira",
  "sexta-feira",
  "sábado",
];
const MONTH_NAMES_PT = [
  "janeiro",
  "fevereiro",
  "março",
  "abril",
  "maio",
  "junho",
  "julho",
  "agosto",
  "setembro",
  "outubro",
  "novembro",
  "dezembro",
];

function formatDateHeader(dateISO: string): string {
  const d = new Date(dateISO + "T12:00:00Z");
  const day = DAY_NAMES_PT[d.getUTCDay()];
  const num = d.getUTCDate();
  const month = MONTH_NAMES_PT[d.getUTCMonth()];
  const year = d.getUTCFullYear();
  return `${day.charAt(0).toUpperCase() + day.slice(1)}, ${num} de ${month} de ${year}`;
}

function isoToHHMM(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function buildLocalISO(dateISO: string, hhmm: string): string {
  const [h, m] = hhmm.split(":").map(Number);
  const d = new Date(dateISO + "T00:00:00");
  d.setHours(h, m, 0, 0);
  return d.toISOString();
}

function formatTimeRange(startISO: string, endISO: string | null): string {
  const s = isoToHHMM(startISO);
  if (!endISO) return s;
  return `${s} – ${isoToHHMM(endISO)}`;
}

interface TaskRowProps {
  task: Task;
  projects: Project[];
  categories: Category[];
  onEdit: (task: Task) => void;
  onDelete: (id: string) => void;
  selectMode?: boolean;
  selected?: boolean;
  onToggleSelect?: (id: string) => void;
}

function TaskRow({
  task,
  projects,
  categories,
  onEdit,
  onDelete,
  selectMode = false,
  selected = false,
  onToggleSelect,
}: TaskRowProps) {
  const projectName = projects.find((p) => p.id === task.projectId)?.name;
  const categoryName = categories.find((c) => c.id === task.categoryId)?.name;

  return (
    <div
      className={`flex items-center gap-3 px-5 py-3 border-b border-gray-800 transition-colors ${
        selectMode
          ? `cursor-pointer ${selected ? "bg-blue-500/10 hover:bg-blue-500/15" : "hover:bg-gray-900/50"}`
          : "hover:bg-gray-900/50"
      }`}
      onClick={selectMode ? () => onToggleSelect?.(task.id) : undefined}
    >
      {selectMode ? (
        <input
          type="checkbox"
          checked={selected}
          onChange={() => onToggleSelect?.(task.id)}
          onClick={(e) => e.stopPropagation()}
          className="shrink-0 accent-blue-500 w-3.5 h-3.5 cursor-pointer"
        />
      ) : (
        <DollarSign
          size={13}
          className={`shrink-0 ${task.billable ? "text-green-400" : "text-gray-500"}`}
        />
      )}
      <span className="text-xs text-gray-500 shrink-0 font-mono tabular-nums w-28">
        {formatTimeRange(task.startTime, task.endTime)}
      </span>
      <span className="flex-1 text-sm text-gray-200 truncate">
        {task.name ?? <span className="text-gray-500 italic">(sem nome)</span>}
      </span>
      {projectName && (
        <span className="text-xs text-gray-500 truncate max-w-24">{projectName}</span>
      )}
      {categoryName && (
        <span className="text-xs text-gray-500 truncate max-w-24">{categoryName}</span>
      )}
      <span className="text-xs text-gray-500 font-mono tabular-nums shrink-0">
        {formatHHMMSS(task.durationSeconds ?? 0)}
      </span>
      {!selectMode && (
        <>
          <button
            onClick={() => onEdit(task)}
            className="text-gray-700 hover:text-gray-300 transition-colors shrink-0"
          >
            <Pencil size={13} />
          </button>
          <button
            onClick={() => onDelete(task.id)}
            className="text-gray-700 hover:text-red-400 transition-colors shrink-0 mr-1"
          >
            <Trash2 size={14} />
          </button>
        </>
      )}
    </div>
  );
}

export function RetroactivePage() {
  const { taskRepo, plannedTaskRepo } = useRepositories();
  const today = todayISO();
  const { projects } = useProjects();
  const { categories } = useCategories();

  const [selectedDate, setSelectedDate] = useState(today);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [plannedTasks, setPlannedTasks] = useState<PlannedTask[]>([]);
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const [editingTask, setEditingTask] = useState<Task | null>(null);

  const loadTasks = useCallback(async () => {
    const startBound = new Date(selectedDate + "T00:00:00").toISOString();
    const endBound = new Date(selectedDate + "T23:59:59.999").toISOString();
    const all = await taskRepo.findByDateRange(startBound, endBound);
    const completed = all.filter((t) => t.status === "completed");
    setTasks([...completed].sort((a, b) => b.startTime.localeCompare(a.startTime)));
  }, [taskRepo, selectedDate]);

  const loadPlannedTasks = useCallback(async () => {
    const all = await plannedTaskRepo.findForDate(selectedDate);
    setPlannedTasks(all.filter((t) => !t.completedDates.includes(selectedDate)));
  }, [plannedTaskRepo, selectedDate]);

  const form = useRetroactiveForm({
    selectedDate,
    projects,
    categories,
    onTaskAdded: loadTasks,
  });

  useEffect(() => {
    void loadTasks();
    void loadPlannedTasks();
  }, [loadTasks, loadPlannedTasks]);

  async function handleDelete(id: string) {
    await deleteTask(taskRepo, id);
    await loadTasks();
  }

  async function handleDirectLaunch(task: PlannedTask) {
    const startISO = buildLocalISO(selectedDate, task.startTime!);
    let endISO = buildLocalISO(selectedDate, task.endTime!);
    if (new Date(endISO) <= new Date(startISO)) {
      endISO = buildLocalISO(addDaysISO(selectedDate, 1), task.endTime!);
    }
    const durationSeconds = Math.round(
      (new Date(endISO).getTime() - new Date(startISO).getTime()) / 1000
    );
    await createRetroactiveTask(
      taskRepo,
      {
        name: task.name || null,
        projectId: task.projectId,
        categoryId: task.categoryId,
        billable: task.billable,
        startTime: startISO,
        endTime: endISO,
        durationSeconds,
      },
      new Date().toISOString()
    );
    await completePlannedTask(plannedTaskRepo, task.id, selectedDate);
    form.advanceChainStart(task.endTime!);
    await Promise.all([loadTasks(), loadPlannedTasks()]);
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
      await deleteTask(taskRepo, id);
    }
    await loadTasks();
    exitSelectMode();
  }

  const { startTour, hasSeenTour } = useTour("retroactive");

  useEffect(() => {
    if (!hasSeenTour) {
      const t = setTimeout(() => startTour(), 400);
      return () => clearTimeout(t);
    }
  }, [hasSeenTour]); // eslint-disable-line react-hooks/exhaustive-deps

  const totalSeconds = tasks.reduce((acc, t) => acc + (t.durationSeconds ?? 0), 0);

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div data-tour="retroactive-header" className="px-5 py-3 border-b border-gray-800 flex items-center gap-3">
        <button
          onClick={() => setSelectedDate(addDaysISO(selectedDate, -1))}
          className="text-gray-500 hover:text-gray-200 p-1 rounded-lg hover:bg-gray-800 transition-colors"
        >
          <ChevronLeft size={16} />
        </button>
        <DatePickerInput
          value={selectedDate}
          onChange={setSelectedDate}
          className="text-sm font-medium text-gray-200"
          maxDate={new Date()}
        />
        <button
          onClick={() => setSelectedDate(addDaysISO(selectedDate, 1))}
          disabled={selectedDate >= today}
          className="text-gray-500 hover:text-gray-200 p-1 rounded-lg hover:bg-gray-800 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
        >
          <ChevronRight size={16} />
        </button>
        <span className="flex-1 text-sm text-gray-400">{formatDateHeader(selectedDate)}</span>
        {tasks.length > 0 && (
          selectMode ? (
            <div className="flex items-center gap-3">
              <button
                onClick={() => {
                  const allSelected = selectedIds.size >= tasks.length;
                  setSelectedIds(allSelected ? new Set() : new Set(tasks.map((t) => t.id)));
                }}
                className="text-xs text-gray-400 hover:text-gray-200 transition-colors"
              >
                {selectedIds.size >= tasks.length ? "Desmarcar todas" : "Selecionar todas"}
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
            </div>
          ) : (
            <div className="flex items-center gap-3">
              {totalSeconds > 0 && (
                <span className="text-xs text-gray-500 font-mono tabular-nums">
                  {formatHHMMSS(totalSeconds)} total
                </span>
              )}
              <button
                onClick={() => setSelectMode(true)}
                className="text-xs px-2.5 py-1 border border-gray-700 text-gray-400 hover:border-gray-500 hover:text-gray-200 rounded-lg transition-colors"
              >
                Selecionar tarefas
              </button>
            </div>
          )
        )}
        <button
          onClick={() => startTour()}
          title="Ver tour da página"
          className="w-5 h-5 shrink-0 rounded-full border border-gray-700 text-gray-600 hover:border-gray-500 hover:text-gray-400 transition-colors text-[11px] font-medium flex items-center justify-center"
        >
          ?
        </button>
      </div>

      {/* Tarefas planejadas para o dia — sugestões para lançamento */}
      {plannedTasks.length > 0 && (
        <div className="border-b border-gray-800 shrink-0">
          <p className="px-5 pt-2.5 pb-1 text-[11px] font-medium text-gray-500 uppercase tracking-wide">
            Planejadas para este dia
          </p>
          <div className="max-h-36 overflow-y-auto">
          {plannedTasks.map((task) => {
            const projectName = projects.find((p) => p.id === task.projectId)?.name;
            const categoryName = categories.find((c) => c.id === task.categoryId)?.name;
            const hasTime = !!(task.startTime && task.endTime);
            return (
              <div
                key={task.id}
                className="flex items-center gap-2 px-5 py-2 hover:bg-gray-800/40 transition-colors"
              >
                <button
                  onClick={() =>
                    hasTime ? void handleDirectLaunch(task) : form.prefill(task)
                  }
                  title={hasTime ? "Lançar diretamente" : "Pré-preencher formulário"}
                  className={`shrink-0 p-1 rounded-lg transition-colors ${
                    hasTime
                      ? "text-green-400 hover:text-green-300 hover:bg-green-900/30"
                      : "text-gray-500 hover:text-gray-300 hover:bg-gray-800"
                  }`}
                >
                  <Play size={12} />
                </button>
                <span className="flex-1 text-sm text-gray-200 truncate">{task.name}</span>
                {hasTime && (
                  <span className="text-xs text-gray-500 font-mono shrink-0">
                    {task.startTime}–{task.endTime}
                  </span>
                )}
                {projectName && (
                  <span className="text-xs text-gray-600 truncate max-w-20 shrink-0">
                    {projectName}
                  </span>
                )}
                {categoryName && (
                  <span className="text-xs text-gray-600 truncate max-w-20 shrink-0">
                    {categoryName}
                  </span>
                )}
              </div>
            );
          })}
          </div>
        </div>
      )}

      {/* Formulário inline */}
      <div data-tour="retroactive-form" className="px-5 py-4 border-b border-gray-800 space-y-3">
        <input
          ref={form.nameRef}
          type="text"
          value={form.name}
          onChange={(e) => form.setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.nativeEvent.isComposing) void form.handleAdd();
          }}
          placeholder="Nome da tarefa (opcional)"
          className="w-full px-2.5 py-1.5 text-sm bg-gray-800 border border-gray-700 rounded-lg text-gray-100 placeholder-gray-500 focus:outline-none focus:border-blue-500"
        />

        <div className="flex gap-2 items-center">
          <Autocomplete
            value={form.projectName}
            onChange={form.setProjectName}
            onSelect={(o) => form.setSelectedProjectId(o.id)}
            onEnter={form.handleAdd}
            options={projects}
            placeholder="Projeto"
            className="flex-1"
          />
          <Autocomplete
            value={form.categoryName}
            onChange={(v) => {
              form.setCategoryName(v);
              const cat = categories.find((c) => c.name === v);
              if (cat) form.setBillable(cat.defaultBillable);
            }}
            onSelect={(o) => {
              form.setSelectedCategoryId(o.id);
              const cat = categories.find((c) => c.id === o.id);
              if (cat) form.setBillable(cat.defaultBillable);
            }}
            onEnter={form.handleAdd}
            options={categories}
            placeholder="Categoria"
            className="flex-1"
          />
          <button
            type="button"
            onClick={() => form.setBillable((b) => !b)}
            title={
              form.billable
                ? "Billable — clique para alternar"
                : "Non-billable — clique para alternar"
            }
            className={`flex items-center gap-1 shrink-0 transition-colors ${
              form.billable ? "text-green-400" : "text-gray-500 hover:text-gray-400"
            }`}
          >
            <DollarSign size={14} />
          </button>
        </div>

        {/* Início, Fim, Duração */}
        <div data-tour="retroactive-timeinputs" className="flex gap-2 items-center">
          <span className="text-xs text-gray-500 shrink-0">Duração</span>
          <input
            data-tour="retroactive-duration"
            type="text"
            value={form.durationInput}
            onChange={(e) => form.setDurationInput(e.target.value)}
            onBlur={form.commitDuration}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                const newEnd = form.commitDuration();
                if (newEnd) void form.handleAdd(newEnd);
              }
            }}
            placeholder="HH:MM"
            title="Aceita: 1:30, 90, 1h, 1h 30m"
            className="w-20 px-2 py-1.5 text-sm bg-gray-800 border border-gray-700 rounded-lg text-gray-400 placeholder-gray-600 focus:outline-none focus:border-blue-500 focus:text-gray-100"
          />
          <span className="text-xs text-gray-600 shrink-0">1:30, 90, 1h…</span>
          <span className="text-xs text-gray-500 shrink-0 ml-auto">Início</span>
          <input
            type="time"
            value={form.startTime}
            onChange={(e) => form.handleStartChange(e.target.value)}
            onBlur={(e) => form.handleStartCommit(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                if (!form.startTime) {
                  form.handleStartCommit("");
                  return;
                }
                void form.handleAdd();
              }
            }}
            className="w-28 px-2 py-1.5 text-sm bg-gray-800 border border-gray-700 rounded-lg text-gray-100 focus:outline-none focus:border-blue-500"
          />
          <span className="text-xs text-gray-500 shrink-0">Fim</span>
          <input
            type="time"
            value={form.endTime}
            onChange={(e) => form.handleEndChange(e.target.value)}
            onBlur={(e) => form.handleEndCommit(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.stopPropagation();
                if (!form.endTime) {
                  form.handleEndCommit("");
                  return;
                }
                void form.handleAdd();
              }
            }}
            className="w-28 px-2 py-1.5 text-sm bg-gray-800 border border-gray-700 rounded-lg text-gray-100 focus:outline-none focus:border-blue-500"
          />

          <button
            onClick={() => void form.handleAdd()}
            disabled={form.saving}
            className="px-4 py-1.5 text-sm bg-blue-600 hover:bg-blue-500 text-white rounded-lg transition-colors disabled:opacity-50"
          >
            Adicionar
          </button>
        </div>

        {form.error && <p className="text-xs text-red-400">{form.error}</p>}
      </div>

      {/* Lista de tarefas */}
      <div data-tour="retroactive-task-list" className="flex-1 min-h-0 flex flex-col">
      <div className="flex-1 overflow-y-auto pr-2">
        {tasks.length === 0 ? (
          <p className="text-center text-gray-600 text-sm py-10">Nenhuma entrada para este dia</p>
        ) : (
          tasks.map((t) => (
            <TaskRow
              key={t.id}
              task={t}
              projects={projects}
              categories={categories}
              onEdit={setEditingTask}
              onDelete={handleDelete}
              selectMode={selectMode}
              selected={selectedIds.has(t.id)}
              onToggleSelect={toggleSelectTask}
            />
          ))
        )}
      </div>
      </div>

      {editingTask && (
        <EditTaskModal
          task={editingTask}
          projects={projects}
          categories={categories}
          onSave={loadTasks}
          onClose={() => setEditingTask(null)}
        />
      )}
    </div>
  );
}
