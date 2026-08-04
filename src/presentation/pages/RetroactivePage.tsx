import type { Category } from "@domain/entities/Category";
import type { PlannedTask } from "@domain/entities/PlannedTask";
import type { Project } from "@domain/entities/Project";
import type { Task } from "@domain/entities/Task";
import { completePlannedTask } from "@domain/usecases/plannedTasks/CompletePlannedTask";
import { getPlannedTasksForDate } from "@domain/usecases/plannedTasks/GetPlannedTasksForDate";
import { createRetroactiveTask } from "@domain/usecases/tasks/CreateRetroactiveTask";
import { deleteTask } from "@domain/usecases/tasks/DeleteTask";
import { getTasksForDate } from "@domain/usecases/tasks/GetTasksForDate";
import { CollapsibleFormColumn } from "@presentation/components/CollapsibleFormColumn";
import { DatePickerInput } from "@presentation/components/DatePickerInput";
import { RetroactiveEntryForm } from "@presentation/components/RetroactiveEntryForm";
import { useRepositories } from "@presentation/contexts/RepositoriesContext";
import { useActiveWorkspaceId } from "@presentation/contexts/WorkspaceContext";
import { useCategories } from "@presentation/hooks/useCategories";
import { useCustomFields } from "@presentation/hooks/useCustomFields";
import { usePersistedFlag } from "@presentation/hooks/usePersistedFlag";
import { useProjects } from "@presentation/hooks/useProjects";
import { useRetroactiveForm } from "@presentation/hooks/useRetroactiveForm";
import { useTour } from "@presentation/hooks/useTour";
import { EditTaskModal } from "@presentation/modals/EditTaskModal";
import { OVERLAY_EVENTS } from "@shared/types/overlayEvents";
import { notifyTasksChanged } from "@shared/utils/taskSync";
import { addDaysISO, formatHHMMSS, todayISO } from "@shared/utils/time";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
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
      {/* Nome em cima, sozinho e com a linha inteira: é por ele que se procura
          um apontamento, e disputando espaço com horário, projeto e categoria
          ele era o primeiro a ser truncado. Os demais campos descem para uma
          segunda linha, lado a lado, como legenda do que está acima. */}
      <div className="flex-1 min-w-0 flex flex-col gap-0.5">
        <div className="flex items-baseline gap-3">
          <span className="flex-1 min-w-0 text-sm text-gray-200 truncate">
            {task.name ?? <span className="text-gray-500 italic">(sem nome)</span>}
          </span>
          {/* O horário sobe para a linha do nome e encosta na direita, alinhado
              com a duração logo abaixo: os dois são a mesma informação vista de
              dois jeitos, e juntos liberam a linha de baixo inteira para projeto
              e categoria, que são os campos que truncavam. */}
          <span className="shrink-0 text-xs text-gray-500 font-mono tabular-nums">
            {formatTimeRange(task.startTime, task.endTime)}
          </span>
        </div>
        <div className="flex items-center gap-3 text-xs text-gray-500">
          {projectName && <span className="truncate">{projectName}</span>}
          {categoryName && <span className="truncate">{categoryName}</span>}
          <span className="ml-auto shrink-0 font-mono tabular-nums">
            {formatHHMMSS(task.durationSeconds ?? 0)}
          </span>
        </div>
      </div>
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
  const workspaceId = useActiveWorkspaceId();
  const today = todayISO();
  const { projects } = useProjects();
  const { categories } = useCategories();

  const [selectedDate, setSelectedDate] = useState(today);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [plannedTasks, setPlannedTasks] = useState<PlannedTask[]>([]);
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const [editingTask, setEditingTask] = useState<Task | null>(null);

  // Pelos use cases, e sempre com o workspace ativo. Ir direto ao repositório
  // sem o terceiro argumento é o caminho das integrações (§6.7) e devolvia as
  // tarefas de todos os workspaces — a tela não mudava nada ao trocar de um
  // para outro. `workspaceId` nas dependências é o que faz a troca recarregar.
  const loadTasks = useCallback(async () => {
    const all = await getTasksForDate(taskRepo, selectedDate, workspaceId);
    const completed = all.filter((t) => t.status === "completed");
    setTasks([...completed].sort((a, b) => b.startTime.localeCompare(a.startTime)));
  }, [taskRepo, selectedDate, workspaceId]);

  const loadPlannedTasks = useCallback(async () => {
    const all = await getPlannedTasksForDate(plannedTaskRepo, selectedDate, workspaceId);
    setPlannedTasks(all.filter((t) => !t.completedDates.includes(selectedDate)));
  }, [plannedTaskRepo, selectedDate, workspaceId]);

  const { activeFields } = useCustomFields();
  const formColumn = usePersistedFlag("retroactiveFormCollapsed");
  const form = useRetroactiveForm({
    selectedDate,
    projects,
    categories,
    onTaskAdded: async () => {
      await Promise.all([loadTasks(), loadPlannedTasks()]);
    },
  });

  useEffect(() => {
    void loadTasks();
    void loadPlannedTasks();
  }, [loadTasks, loadPlannedTasks]);

  useEffect(() => {
    type Prefill = {
      date?: string | null;
      name?: string | null;
      projectName?: string | null;
      categoryName?: string | null;
      start?: string | null;
      end?: string | null;
    };

    function applyPrefill(p: Prefill) {
      // Preencher um formulário recolhido não teria efeito visível nenhum — quem
      // chegou por deeplink veio para conferir e completar os campos.
      formColumn.set(false);
      if (p.date) setSelectedDate(p.date);
      if (p.name != null) form.setName(p.name);
      if (p.projectName != null) form.setProjectName(p.projectName);
      if (p.categoryName != null) form.setCategoryName(p.categoryName);
      if (p.start) form.handleStartChange(p.start);
      if (p.end) form.handleEndChange(p.end);
    }

    const unlisten = listen<Prefill>(OVERLAY_EVENTS.DEEPLINK_RETROACTIVE_PREFILL, ({ payload }) => {
      applyPrefill(payload);
    });

    invoke<Prefill | null>("get_pending_retroactive_prefill").then((p) => {
      if (p) applyPrefill(p);
    });

    return () => {
      unlisten.then((fn) => fn());
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleDelete(id: string) {
    await deleteTask(taskRepo, id);
    void notifyTasksChanged();
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
        workspaceId,
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
    void notifyTasksChanged();
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
    void notifyTasksChanged();
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
      <div
        data-tour="retroactive-header"
        className="px-5 py-3 border-b border-gray-800 flex items-center gap-3"
      >
        <button
          onClick={() => setSelectedDate(addDaysISO(selectedDate, -1))}
          className="text-gray-500 hover:text-gray-200 p-1 rounded-lg hover:bg-gray-800 transition-colors"
        >
          <ChevronLeft size={16} />
        </button>
        <DatePickerInput
          value={selectedDate}
          onChange={setSelectedDate}
          className="text-sm font-medium text-gray-200 w-30"
          maxDate={new Date()}
        />
        <button
          onClick={() => setSelectedDate(addDaysISO(selectedDate, 1))}
          disabled={selectedDate >= today}
          className="text-gray-500 hover:text-gray-200 p-1 rounded-lg hover:bg-gray-800 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
        >
          <ChevronRight size={16} />
        </button>
        <span className="ml-7 flex-1 text-sm text-gray-400">{formatDateHeader(selectedDate)}</span>
        {totalSeconds > 0 && (
          <span className="text-xs text-gray-500 font-mono tabular-nums">
            {formatHHMMSS(totalSeconds)} total
          </span>
        )}
        <button
          onClick={() => startTour()}
          title="Ver tour da página"
          className="w-5 h-5 shrink-0 rounded-full border border-gray-700 text-gray-600 hover:border-gray-500 hover:text-gray-400 transition-colors text-[11px] font-medium flex items-center justify-center"
        >
          ?
        </button>
      </div>

      {/* Formulário à esquerda, dia à direita: com campos personalizados o
          formulário cresce e, empilhado, empurrava a lista para fora da tela. */}
      <div className="flex-1 min-h-0 flex">
        <CollapsibleFormColumn
          collapsed={formColumn.value}
          onToggle={formColumn.toggle}
          label="Novo apontamento"
          tourId="retroactive-form"
        >
          <RetroactiveEntryForm
            form={form}
            projects={projects}
            categories={categories}
            customFields={activeFields}
          />
        </CollapsibleFormColumn>

        <div className="flex-1 min-w-0 flex flex-col">
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
                        onClick={() => {
                          if (hasTime) {
                            void handleDirectLaunch(task);
                            return;
                          }
                          // Pré-preencher é um convite a revisar os campos: com a
                          // coluna recolhida, o clique não mostraria nada.
                          formColumn.set(false);
                          form.prefill(task);
                        }}
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

          {/* Lista de tarefas */}
          <div data-tour="retroactive-task-list" className="flex-1 min-h-0 flex flex-col">
            {/* Barra de seleção: mora aqui, e não no header, porque age sobre
                esta lista — e o header já estava disputando espaço com a
                navegação de data. Sem tarefas não há o que selecionar. */}
            {tasks.length > 0 && (
              <div className="shrink-0 flex items-center justify-end gap-3 px-5 py-2 border-b border-gray-800">
                {selectMode ? (
                  <>
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

            <div className="flex-1 overflow-y-auto pr-2">
              {tasks.length === 0 ? (
                <p className="text-center text-gray-600 text-sm py-10">
                  Nenhuma entrada para este dia
                </p>
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
