import type { Category } from "@domain/entities/Category";
import type { PlannedTask } from "@domain/entities/PlannedTask";
import type { Project } from "@domain/entities/Project";
import type { Task } from "@domain/entities/Task";
import { getPlannedTasksForDate } from "@domain/usecases/plannedTasks/GetPlannedTasksForDate";
import { deleteTask } from "@domain/usecases/tasks/DeleteTask";
import { launchPlannedTaskRetroactively } from "@domain/usecases/tasks/LaunchPlannedTaskRetroactively";
import { getTasksForDate } from "@domain/usecases/tasks/GetTasksForDate";
import { CollapsibleFormColumn } from "@presentation/components/CollapsibleFormColumn";
import { DatePickerInput } from "@presentation/components/DatePickerInput";
import { ResizeHandle } from "@presentation/components/ResizeHandle";
import { RetroactiveEntryForm } from "@presentation/components/RetroactiveEntryForm";
import { PageHeader } from "@presentation/components/ui";
import { useRepositories } from "@presentation/contexts/RepositoriesContext";
import { useActiveWorkspaceId, useWorkspaces } from "@presentation/contexts/WorkspaceContext";
import { useCategories } from "@presentation/hooks/useCategories";
import { useCustomFields } from "@presentation/hooks/useCustomFields";
import { usePersistedFlag } from "@presentation/hooks/usePersistedFlag";
import { useProjects } from "@presentation/hooks/useProjects";
import { useResizablePanel } from "@presentation/hooks/useResizablePanel";
import { useRetroactiveForm } from "@presentation/hooks/useRetroactiveForm";
import { useTour } from "@presentation/hooks/useTour";
import { EditTaskModal } from "@presentation/modals/EditTaskModal";
import { MoveToWorkspaceModal } from "@presentation/modals/MoveToWorkspaceModal";
import { OVERLAY_EVENTS } from "@shared/types/overlayEvents";
import { notifyTasksChanged } from "@shared/utils/taskSync";
import { addDaysISO, formatHHMMSS, todayISO } from "@shared/utils/time";
import { invoke } from "@tauri-apps/api/core";
import { emit, listen } from "@tauri-apps/api/event";
import {
  ChevronLeft,
  ChevronRight,
  DollarSign,
  ListChecks,
  Pencil,
  Play,
  Trash2,
} from "lucide-react";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";

/**
 * Limites do arraste da lista de planejadas. O padrão é a altura que ela tinha
 * fixa (`max-h-36` = 144px), então quem nunca arrastar não vê diferença. O
 * mínimo cabe duas linhas — menos que isso a seção deixa de informar e só ocupa
 * espaço, e quem não a quer tem o dia sem planejadas, em que ela não aparece.
 */
const PLANNED_LIST_HEIGHT = { min: 72, max: 480, default: 144 } as const;

function isoToHHMM(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
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
  const { workspaces } = useWorkspaces();
  const today = todayISO();
  const { projects } = useProjects();
  const { categories } = useCategories();

  const [selectedDate, setSelectedDate] = useState(today);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [plannedTasks, setPlannedTasks] = useState<PlannedTask[]>([]);
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const [launchingAll, setLaunchingAll] = useState(false);
  const [launchError, setLaunchError] = useState("");

  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [movingTasks, setMovingTasks] = useState<Task[] | null>(null);

  // Em ordem cronológica: é assim que o lote encadeia o início do formulário no
  // fim da última, e é a ordem em que as reuniões aconteceram.
  const timedPlannedTasks = useMemo(
    () =>
      plannedTasks
        .filter((t) => t.startTime && t.endTime)
        .sort((a, b) => a.startTime!.localeCompare(b.startTime!)),
    [plannedTasks]
  );

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

  // ── Altura da lista de planejadas ──────────────────────────────────────────
  // O teto do arraste é o **conteúdo**, não o limite duro: passado ele não há
  // mais nada a revelar, e deixar o divisor seguir o cursor no vazio faz o
  // gesto parecer quebrado — arrasta-se 200px e nada se move, e o caminho de
  // volta só responde depois de recuperar os mesmos 200px. Parar onde a lista
  // acaba é a mesma resposta de bater no máximo.
  const plannedListRef = useRef<HTMLDivElement | null>(null);
  const [plannedContentHeight, setPlannedContentHeight] = useState<number>(PLANNED_LIST_HEIGHT.max);
  useLayoutEffect(() => {
    const el = plannedListRef.current;
    if (el) setPlannedContentHeight(el.scrollHeight);
  }, [plannedTasks]);

  const plannedPanel = useResizablePanel({
    key: "retroactivePlannedHeight",
    min: PLANNED_LIST_HEIGHT.min,
    // O `Math.max` protege a invariante do clamp: com uma planejada só, o
    // conteúdo é menor que o mínimo e um `max` abaixo do `min` inverteria os dois.
    max: Math.max(PLANNED_LIST_HEIGHT.min, Math.min(PLANNED_LIST_HEIGHT.max, plannedContentHeight)),
    defaultSize: PLANNED_LIST_HEIGHT.default,
    anchor: "top",
  });
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

  // Esta tela era a única lista de tarefas que não escutava os dois avisos entre
  // janelas: concluir uma planejada pelo popup não sumia com a sugestão daqui, e
  // parar uma tarefa pelo overlay não trazia o registro para a lista do dia. As
  // recargas são as mesmas do efeito acima, então elas já recortam pelo dia
  // selecionado — e por isso os callbacks precisam ficar nas dependências: presos
  // ao mount, o listener recarregaria para sempre a data de quando a tela abriu.
  useEffect(() => {
    const unlistenPlanned = listen(OVERLAY_EVENTS.PLANNED_TASKS_CHANGED, () => {
      void loadPlannedTasks();
    });
    const unlistenTasks = listen(OVERLAY_EVENTS.TASKS_CHANGED, () => {
      void loadTasks();
    });
    return () => {
      unlistenPlanned.then((fn) => fn());
      unlistenTasks.then((fn) => fn());
    };
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

  // Avisar as outras janelas e recarregar a tela é o mesmo desfecho para um
  // lançamento e para o lote inteiro — no lote, uma vez só no fim, em vez de uma
  // recarga por tarefa lançada.
  async function afterLaunch(lastEndHHMM: string | null) {
    void notifyTasksChanged();
    // O mesmo defeito na direção contrária: lançar direto conclui a planejada, e
    // sem o aviso ela seguia pendente no popup e no planejamento.
    void emit(OVERLAY_EVENTS.PLANNED_TASKS_CHANGED, {});
    // Nada lançado não move a cadeia — reaplicar o início atual só reescreveria
    // o fim do formulário que o usuário talvez já tenha ajustado.
    if (lastEndHHMM) form.advanceChainStart(lastEndHHMM);
    await Promise.all([loadTasks(), loadPlannedTasks()]);
  }

  async function handleDirectLaunch(task: PlannedTask) {
    await launchPlannedTaskRetroactively(
      taskRepo,
      plannedTaskRepo,
      task,
      selectedDate,
      new Date().toISOString()
    );
    await afterLaunch(task.endTime!);
  }

  /**
   * Lança de uma vez todas as planejadas do dia que já trazem horário — na
   * prática, as importadas do Google Agenda e do Monday. Elas não têm nada a
   * revisar: o intervalo veio do evento, e o clique a clique só repetia a mesma
   * confirmação por linha num dia cheio de reuniões.
   *
   * Falha de uma não interrompe as seguintes, pela mesma razão do envio de horas
   * (§5.7): o que já foi gravado fica, e o que não deu certo continua pendente na
   * lista para ser tentado de novo — abortar deixaria o resultado do lote
   * dependendo de qual tarefa falhou primeiro.
   */
  async function handleLaunchAllTimed() {
    if (launchingAll || timedPlannedTasks.length === 0) return;
    setLaunchingAll(true);
    setLaunchError("");

    const nowISO = new Date().toISOString();
    let lastEnd = "";
    let failed = 0;
    for (const task of timedPlannedTasks) {
      try {
        await launchPlannedTaskRetroactively(taskRepo, plannedTaskRepo, task, selectedDate, nowISO);
        if (task.endTime! > lastEnd) lastEnd = task.endTime!;
      } catch {
        failed += 1;
      }
    }

    setLaunchingAll(false);
    if (failed > 0) {
      setLaunchError(
        failed === 1
          ? "1 tarefa não pôde ser lançada."
          : `${failed} tarefas não puderam ser lançadas.`
      );
    }
    await afterLaunch(lastEnd || null);
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

  // O aviso do lote descreve a lista de um dia — trocar de dia o deixaria falando
  // de tarefas que saíram da tela, como a mensagem do envio manual (§5.7).
  function goToDate(dateISO: string) {
    setLaunchError("");
    setSelectedDate(dateISO);
  }

  return (
    <div className="h-full flex flex-col">
      <PageHeader
        title="Lançamento manual"
        tourId="retroactive-header"
        onStartTour={startTour}
        context={
          <div className="flex items-center gap-3 min-w-0">
            <button
              onClick={() => goToDate(addDaysISO(selectedDate, -1))}
              className="text-fg-muted hover:text-fg p-1 rounded-control hover:bg-raised transition-colors"
            >
              <ChevronLeft size={16} />
            </button>
            <DatePickerInput
              value={selectedDate}
              onChange={goToDate}
              className="text-sm font-medium text-fg w-30"
              maxDate={new Date()}
            />
            <button
              onClick={() => goToDate(addDaysISO(selectedDate, 1))}
              disabled={selectedDate >= today}
              className="text-fg-muted hover:text-fg p-1 rounded-control hover:bg-raised transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
            >
              <ChevronRight size={16} />
            </button>
          </div>
        }
        actions={
          totalSeconds > 0 ? (
            <span className="text-xs text-fg-muted font-mono tabular-nums">
              {formatHHMMSS(totalSeconds)} total
            </span>
          ) : undefined
        }
      />

      {/* Formulário à esquerda, dia à direita: com campos personalizados o
          formulário cresce e, empilhado, empurrava a lista para fora da tela. */}
      <div className="flex-1 min-h-0 flex">
        <CollapsibleFormColumn
          collapsed={formColumn.value}
          onToggle={formColumn.toggle}
          label="Novo apontamento"
          widthKey="retroactiveFormWidth"
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
          {/* Tarefas planejadas para o dia — sugestões para lançamento. Sem
              `border-b`: quem desenha a linha é o `ResizeHandle` abaixo, ou
              haveria linha dupla. */}
          {plannedTasks.length > 0 && (
            <div className="shrink-0">
              <div className="flex items-center gap-3 px-5 pt-2.5 pb-1">
                <p className="text-[11px] font-medium text-gray-500 uppercase tracking-wide">
                  Planejadas para este dia
                </p>
                {/* Com uma só, o ▶ da própria linha já é este botão — o lote
                    existe para o dia cheio de reuniões importadas. */}
                {timedPlannedTasks.length > 1 && (
                  <button
                    onClick={() => void handleLaunchAllTimed()}
                    disabled={launchingAll}
                    title="Cria um apontamento para cada planejada que já traz horário, usando o intervalo do evento"
                    className="ml-auto flex items-center gap-1.5 text-xs text-green-400 hover:text-green-300 disabled:text-gray-600 disabled:cursor-not-allowed transition-colors"
                  >
                    <ListChecks size={13} />
                    {launchingAll ? "Lançando…" : `Lançar ${timedPlannedTasks.length} com horário`}
                  </button>
                )}
              </div>
              {launchError && <p className="px-5 pb-1 text-xs text-red-400">{launchError}</p>}
              {/* `maxHeight`, não `height`: com duas planejadas a seção encolhe
                  até o conteúdo, como fazia com o `max-h-36` que isto substitui
                  — altura fixa deixaria espaço vazio todo dia. */}
              <div
                ref={plannedListRef}
                className="overflow-y-auto"
                style={{ maxHeight: plannedPanel.size }}
              >
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
                        // Com o lote em curso, o clique aqui lançaria de novo o
                        // que a fila já está lançando — a lista só se atualiza
                        // no fim.
                        disabled={launchingAll}
                        title={hasTime ? "Lançar diretamente" : "Pré-preencher formulário"}
                        className={`shrink-0 p-1 rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
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

          {plannedTasks.length > 0 && (
            <ResizeHandle
              {...plannedPanel.handleProps}
              active={plannedPanel.isDragging}
              aria-label="Altura da lista de planejadas"
              title="Arraste para redimensionar. Duplo clique volta ao padrão."
            />
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
                    {workspaces.length > 1 && (
                      <button
                        onClick={() => setMovingTasks(tasks.filter((t) => selectedIds.has(t.id)))}
                        disabled={selectedIds.size === 0}
                        className="text-xs text-gray-400 hover:text-gray-200 disabled:text-gray-600 disabled:cursor-not-allowed transition-colors"
                      >
                        Mover para workspace
                      </button>
                    )}
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

      {movingTasks && (
        <MoveToWorkspaceModal
          tasks={movingTasks}
          projects={projects}
          categories={categories}
          onMoved={() => {
            // Mover tira a tarefa do workspace ativo, então some daqui — e
            // some também das listas das outras janelas, que só recarregam
            // pelo aviso, como em toda mutação desta tela.
            void notifyTasksChanged();
            exitSelectMode();
            void loadTasks();
          }}
          onClose={() => setMovingTasks(null)}
        />
      )}
    </div>
  );
}
