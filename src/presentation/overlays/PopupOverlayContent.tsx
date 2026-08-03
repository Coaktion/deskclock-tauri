import type { Category } from "@domain/entities/Category";
import type { PlannedTask, PlannedTaskAction } from "@domain/entities/PlannedTask";
import type { Project } from "@domain/entities/Project";
import type { Task } from "@domain/entities/Task";
import type { TaskGroup } from "@domain/utils/groupTasks";
import { ActionChip } from "@presentation/components/ActionChip";
import { Autocomplete } from "@presentation/components/Autocomplete";
import { useCategories } from "@presentation/hooks/useCategories";
import { useCompletedTasksForDate } from "@presentation/hooks/useCompletedTasksForDate";
import { usePlannedTasksForDate } from "@presentation/hooks/usePlannedTasks";
import { useProjects } from "@presentation/hooks/useProjects";
import { CompletedTasksSection } from "@presentation/overlays/CompletedTasksSection";
import { useTaskTimer } from "@presentation/hooks/useTaskTimer";
import { OVERLAY_EVENTS } from "@shared/types/overlayEvents";
import { OverlayWorkspaceChip } from "@presentation/overlays/OverlayWorkspaceChip";
import { getProjectColor } from "@shared/utils/projectColor";
import { formatHHMMSS, parseStartTimeInput, todayISO } from "@shared/utils/time";
import { emit } from "@tauri-apps/api/event";
import {
  ArrowRight,
  Bell,
  CalendarDays,
  Check,
  CheckCircle2,
  Clock,
  DollarSign,
  Pause,
  Pen,
  Play,
  Square,
  X,
} from "lucide-react";
import { useTrackedMeetingTitles } from "@presentation/hooks/useTrackedMeetingTitles";
import { useEffect, useRef, useState } from "react";

const POPUP_W = 288;
const HEADER_H = 37;
const FOOTER_H = 34;

// Idle state layout
const NEW_TASK_H = 45;
const TABS_H = 32;
const CONTENT_H = 188; // área da aba ativa (altura fixa; a lista rola internamente)
const ROW_H = 44;

// Running state layout (execution section fills popup body)
const EXEC_H = 262; // status + name + timer + start-time + project + category + billable + divider + controls
const EXEC_H_CONFIRMING = 302; // EXEC_H + extra rows for end-time input + Concluída/Pendente buttons
const ACTIONS_SECTION_H = 48; // section label + one row of action chips

/**
 * Typeahead dos chips de Projeto e Categoria: com o chip focado pelo teclado,
 * qualquer caractere abre a lista já filtrando por ele, como faz um `<select>`
 * nativo. Antes só Enter e espaço abriam — as demais teclas caíam no vazio, e
 * quem chegava ao chip pelo Tab não tinha sinal de que ele era editável.
 *
 * Enter e as teclas de navegação têm `key` com mais de um caractere e passam
 * direto: o Enter continua abrindo pelo clique nativo do botão. O espaço abre
 * sem semear, e é o único que precisa de `preventDefault` — sem ele o botão
 * ainda dispararia o clique, abrindo duas vezes.
 */
function chipTypeahead(open: (seed?: string) => void) {
  return (e: React.KeyboardEvent) => {
    if (e.key.length !== 1 || e.ctrlKey || e.metaKey || e.altKey) return;
    e.preventDefault();
    open(e.key === " " ? undefined : e.key);
  };
}

interface PopupOverlayContentProps {
  runningTask: Task | null;
  activePlannedTaskActions: PlannedTaskAction[];
  onClose: () => void;
  onNavigatePlanning: () => void;
  onResize: (width: number, height: number) => void;
  onStartTask: (input: {
    name?: string | null;
    projectId?: string | null;
    categoryId?: string | null;
    billable: boolean;
    plannedTaskId?: string | null;
  }) => Promise<void>;
  onPlay: (task: PlannedTask) => Promise<void>;
  onPause: () => Promise<void>;
  onResume: () => Promise<void>;
  onStop: (completed: boolean, endTimeISO?: string) => Promise<void>;
  onCancel: () => Promise<void>;
  onUpdateTask: (input: {
    name?: string | null;
    projectId?: string | null;
    categoryId?: string | null;
    billable?: boolean;
    startTime?: string;
  }) => Promise<void>;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmtTime(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

// ─── Execution section (running mode) ────────────────────────────────────────

interface ExecSectionProps {
  task: Task;
  projectName?: string;
  categoryName?: string;
  projects: Project[];
  categories: Category[];
  actions: PlannedTaskAction[];
  confirmingStop: boolean;
  setConfirmingStop: (v: boolean) => void;
  onUpdateTask: (input: {
    name?: string | null;
    projectId?: string | null;
    categoryId?: string | null;
    billable?: boolean;
    startTime?: string;
  }) => Promise<void>;
  onPause: () => Promise<void>;
  onResume: () => Promise<void>;
  onStop: (completed: boolean, endTimeISO?: string) => Promise<void>;
  onCancel: () => Promise<void>;
}

function ExecSection({
  task,
  projectName,
  categoryName,
  projects,
  categories,
  actions,
  confirmingStop,
  setConfirmingStop,
  onUpdateTask,
  onPause,
  onResume,
  onStop,
  onCancel,
}: ExecSectionProps) {
  const seconds = useTaskTimer(task);
  const isRunning = task.status === "running";
  const [endTimeInput, setEndTimeInput] = useState("");
  const [endTimeTouched, setEndTimeTouched] = useState(false);

  function openConfirmStop() {
    const now = new Date();
    setEndTimeInput(
      `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`
    );
    setEndTimeTouched(false);
    setConfirmingStop(true);
  }

  function resolveEndTimeISO(): { iso: string | undefined; error: string | null } {
    if (!endTimeTouched) return { iso: undefined, error: null };
    const parsed = parseStartTimeInput(endTimeInput, task.startTime);
    if (!parsed) return { iso: undefined, error: "Hora inválida" };
    if (new Date(parsed).getTime() < new Date(task.startTime).getTime())
      return { iso: undefined, error: "Após o início" };
    return { iso: parsed, error: null };
  }

  const endTimeResolved = resolveEndTimeISO();

  // ── name ──────────────────────────────────────────────────────────────────
  const [editingName, setEditingName] = useState(false);
  const [nameValue, setNameValue] = useState(task.name ?? "");
  useEffect(() => {
    if (!editingName) setNameValue(task.name ?? "");
  }, [task.name]); // eslint-disable-line react-hooks/exhaustive-deps

  async function saveName() {
    setEditingName(false);
    const n = nameValue.trim() || null;
    if (n !== task.name) await onUpdateTask({ name: n });
  }

  // ── start time ────────────────────────────────────────────────────────────
  const [editingStartTime, setEditingStartTime] = useState(false);
  const [startTimeValue, setStartTimeValue] = useState(() => fmtTime(task.startTime));
  useEffect(() => {
    if (!editingStartTime) setStartTimeValue(fmtTime(task.startTime));
  }, [task.startTime]); // eslint-disable-line react-hooks/exhaustive-deps

  async function saveStartTime() {
    setEditingStartTime(false);
    const newISO = parseStartTimeInput(startTimeValue, task.startTime);
    if (newISO && newISO !== task.startTime) await onUpdateTask({ startTime: newISO });
  }

  // ── project ───────────────────────────────────────────────────────────────
  const [editingProject, setEditingProject] = useState(false);
  const [editProjectName, setEditProjectName] = useState(projectName ?? "");
  const editProjectIdRef = useRef<string | null>(task.projectId ?? null);
  useEffect(() => {
    if (!editingProject) {
      setEditProjectName(projectName ?? "");
      editProjectIdRef.current = task.projectId ?? null;
    }
  }, [projectName, task.projectId]); // eslint-disable-line react-hooks/exhaustive-deps

  // `seed` é o caractere que abriu a edição pelo teclado: entra no lugar do
  // nome atual para a lista já nascer filtrada. O id continua apontando para o
  // projeto de antes — sair sem escolher nada não pode apagar o vínculo por
  // causa de uma tecla.
  function openProjectEdit(seed?: string) {
    editProjectIdRef.current = task.projectId ?? null;
    setEditProjectName(seed ?? projectName ?? "");
    setEditingProject(true);
  }
  async function closeProjectEdit() {
    setEditingProject(false);
    if (editProjectIdRef.current !== task.projectId)
      await onUpdateTask({ projectId: editProjectIdRef.current });
  }

  // ── category ──────────────────────────────────────────────────────────────
  const [editingCategory, setEditingCategory] = useState(false);
  const [editCategoryName, setEditCategoryName] = useState(categoryName ?? "");
  const editCategoryIdRef = useRef<string | null>(task.categoryId ?? null);
  useEffect(() => {
    if (!editingCategory) {
      setEditCategoryName(categoryName ?? "");
      editCategoryIdRef.current = task.categoryId ?? null;
    }
  }, [categoryName, task.categoryId]); // eslint-disable-line react-hooks/exhaustive-deps

  function openCategoryEdit(seed?: string) {
    editCategoryIdRef.current = task.categoryId ?? null;
    setEditCategoryName(seed ?? categoryName ?? "");
    setEditingCategory(true);
  }
  async function closeCategoryEdit() {
    setEditingCategory(false);
    if (editCategoryIdRef.current !== task.categoryId)
      await onUpdateTask({ categoryId: editCategoryIdRef.current });
  }

  return (
    <div className="flex flex-col flex-1 px-4 py-3 gap-2 min-h-0 overflow-visible">
      {/* Status */}
      <div className="flex items-center gap-1.5">
        <span
          className={`w-1.5 h-1.5 rounded-full shrink-0 ${isRunning ? "animate-pulse bg-blue-500" : "bg-amber-500"}`}
        />
        <span
          className={`text-[9px] font-semibold uppercase tracking-[0.12em] ${isRunning ? "text-blue-400" : "text-amber-400"}`}
        >
          {isRunning ? "Rodando" : "Pausada"}
        </span>
      </div>

      {/* Name */}
      {editingName ? (
        <input
          autoFocus
          type="text"
          value={nameValue}
          onChange={(e) => setNameValue(e.target.value)}
          onBlur={saveName}
          onKeyDown={(e) => {
            if (e.key === "Enter") void saveName();
            if (e.key === "Escape") {
              e.stopPropagation();
              setNameValue(task.name ?? "");
              setEditingName(false);
            }
          }}
          placeholder="Nome da tarefa"
          className="w-full px-0 text-[13px] font-medium bg-transparent border-b border-gray-600 text-gray-100 placeholder-gray-500 focus:outline-none focus:border-blue-500"
        />
      ) : (
        <button
          onClick={() => setEditingName(true)}
          className="group flex items-center gap-1 text-left text-[13px] font-medium text-gray-100 hover:text-white leading-snug transition-colors cursor-text w-full"
        >
          <span className="truncate">
            {task.name ?? <span className="text-gray-500 italic">(sem nome)</span>}
          </span>
          <Pen size={11} className="shrink-0 opacity-0 group-hover:opacity-60 transition-opacity" />
        </button>
      )}

      {/* Timer */}
      <p
        className={`font-mono text-[22px] font-semibold tabular-nums leading-none ${isRunning ? "text-blue-400" : "text-amber-400"}`}
      >
        {formatHHMMSS(seconds)}
      </p>

      {/* Project */}
      {editingProject ? (
        <div
          className="w-full"
          onBlur={(e) => {
            if (!e.currentTarget.contains(e.relatedTarget as Node | null)) void closeProjectEdit();
          }}
        >
          <Autocomplete
            autoFocus
            value={editProjectName}
            onChange={(v) => {
              setEditProjectName(v);
              if (!v) editProjectIdRef.current = null;
            }}
            onSelect={(o) => {
              editProjectIdRef.current = o.id;
              setEditProjectName(o.name);
              void onUpdateTask({ projectId: o.id });
              setEditingProject(false);
            }}
            options={projects}
            placeholder="Projeto"
            className="w-full text-[12px]"
            dropUp
          />
        </div>
      ) : (
        <button
          onClick={() => openProjectEdit()}
          onKeyDown={chipTypeahead(openProjectEdit)}
          className={`text-left self-start flex items-center gap-1.5 px-2.5 py-1 text-[12px] rounded-lg border transition-colors ${
            projectName
              ? "text-gray-300 bg-gray-800 border-gray-700 hover:border-gray-500"
              : "text-gray-600 bg-gray-800/50 border-dashed border-gray-700/50 hover:border-gray-600"
          }`}
        >
          {projectName ?? "+ Projeto"}
        </button>
      )}

      {/* Category */}
      {editingCategory ? (
        <div
          className="w-full"
          onBlur={(e) => {
            if (!e.currentTarget.contains(e.relatedTarget as Node | null)) void closeCategoryEdit();
          }}
        >
          <Autocomplete
            autoFocus
            value={editCategoryName}
            onChange={(v) => {
              setEditCategoryName(v);
              if (!v) editCategoryIdRef.current = null;
            }}
            onSelect={(o) => {
              editCategoryIdRef.current = o.id;
              setEditCategoryName(o.name);
              const cat = categories.find((c) => c.id === o.id);
              void onUpdateTask({
                categoryId: o.id,
                billable: cat?.defaultBillable ?? task.billable,
              });
              setEditingCategory(false);
            }}
            options={categories}
            placeholder="Categoria"
            className="w-full text-[12px]"
            dropUp
          />
        </div>
      ) : (
        <button
          onClick={() => openCategoryEdit()}
          onKeyDown={chipTypeahead(openCategoryEdit)}
          className={`self-start flex items-center gap-1.5 px-2.5 py-1 text-[12px] rounded-lg border transition-colors ${
            categoryName
              ? "text-gray-300 bg-gray-800 border-gray-700 hover:border-gray-500"
              : "text-gray-600 bg-gray-800/50 border-dashed border-gray-700/50 hover:border-gray-600"
          }`}
        >
          {categoryName ?? "+ Categoria"}
        </button>
      )}

      <div className="flex gap-1.5 items-center">
        {/* Billable */}
        <button
          onClick={() => void onUpdateTask({ billable: !task.billable })}
          className={`self-start flex items-center gap-1.5 px-2.5 py-1 text-[12px] font-medium rounded-lg border transition-colors ${
            task.billable
              ? "bg-green-900/40 border-green-700 text-green-400 hover:bg-green-900/60"
              : "bg-gray-800 border-gray-700 text-gray-400 hover:border-gray-500"
          }`}
        >
          <DollarSign size={11} />
          {task.billable ? "Billable" : "Non-billable"}
        </button>

        {/* Start time */}
        {editingStartTime ? (
          <div className="flex items-center gap-2">
            <Clock size={11} className="text-gray-500 shrink-0" />
            <input
              autoFocus
              type="time"
              value={startTimeValue}
              onChange={(e) => setStartTimeValue(e.target.value)}
              onBlur={saveStartTime}
              onKeyDown={(e) => {
                if (e.key === "Enter") void saveStartTime();
                if (e.key === "Escape") {
                  e.stopPropagation();
                  setStartTimeValue(fmtTime(task.startTime));
                  setEditingStartTime(false);
                }
              }}
              className="flex-1 bg-transparent border-b border-gray-600 focus:outline-none focus:border-blue-500 text-[12px] text-gray-300"
            />
          </div>
        ) : (
          <button
            onClick={() => setEditingStartTime(true)}
            className="self-start flex items-center gap-1.5 px-2.5 py-1 text-[12px] text-gray-300 bg-gray-800 border border-gray-700 rounded-lg hover:border-gray-500 transition-colors"
          >
            <Clock size={11} className="text-gray-500 shrink-0" />
            {fmtTime(task.startTime)}
          </button>
        )}
      </div>

      {/* Actions section */}
      {actions.length > 0 && (
        <div>
          <p className="text-[9px] font-bold uppercase tracking-widest text-gray-600 mb-1.5">
            Ações
          </p>
          <div className="flex flex-wrap gap-1.5">
            {actions.map((action, i) => (
              <ActionChip key={i} action={action} />
            ))}
          </div>
        </div>
      )}

      {/* Divider */}
      <div className="border-t border-gray-800 mt-auto" />

      {/* Controls */}
      {confirmingStop ? (
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center gap-2">
            <span className="text-[11px] text-gray-400">Encerrar às</span>
            <div className="flex items-center gap-1.5 flex-1">
              <Clock size={11} className="text-gray-500 shrink-0" />
              <input
                type="time"
                value={endTimeInput}
                onChange={(e) => {
                  setEndTimeInput(e.target.value);
                  setEndTimeTouched(true);
                }}
                className={`flex-1 bg-transparent border-b focus:outline-none text-[12px] text-gray-200 ${
                  endTimeResolved.error
                    ? "border-red-500 focus:border-red-400"
                    : "border-gray-600 focus:border-blue-500"
                }`}
              />
            </div>
            <button
              onClick={() => setConfirmingStop(false)}
              className="p-1 text-gray-500 hover:text-blue-400 rounded-lg transition-colors"
              title="Retomar"
            >
              <Play size={11} />
            </button>
          </div>
          {endTimeResolved.error && (
            <span className="text-[10px] text-red-400">{endTimeResolved.error}</span>
          )}
          <div className="flex items-center gap-1.5">
            <button
              disabled={!!endTimeResolved.error}
              onClick={() => {
                setConfirmingStop(false);
                void onStop(true, endTimeResolved.iso);
              }}
              className="flex items-center gap-1 px-2 py-1 text-[11px] bg-green-700/80 hover:bg-green-600 disabled:bg-gray-700 disabled:text-gray-500 disabled:cursor-not-allowed text-white rounded-lg transition-colors"
            >
              <CheckCircle2 size={10} /> Concluída
            </button>
            <button
              disabled={!!endTimeResolved.error}
              onClick={() => {
                setConfirmingStop(false);
                void onStop(false, endTimeResolved.iso);
              }}
              className="flex items-center gap-1 px-2 py-1 text-[11px] bg-gray-700 hover:bg-gray-600 disabled:bg-gray-800 disabled:text-gray-500 disabled:cursor-not-allowed text-gray-200 rounded-lg transition-colors"
            >
              <Clock size={10} /> Pendente
            </button>
          </div>
        </div>
      ) : (
        <div className="flex items-center gap-1.5">
          <button
            onClick={isRunning ? onPause : onResume}
            className="flex items-center gap-1 px-2.5 py-1.5 text-[12px] font-medium text-gray-300 hover:text-gray-100 bg-gray-800 hover:bg-gray-700 rounded-lg transition-colors"
          >
            {isRunning ? (
              <>
                <Pause size={11} /> Pausar
              </>
            ) : (
              <>
                <Play size={11} /> Retomar
              </>
            )}
          </button>
          <button
            onClick={openConfirmStop}
            className="flex items-center gap-1 px-2.5 py-1.5 text-[12px] font-medium text-gray-300 hover:text-gray-100 bg-gray-800 hover:bg-gray-700 rounded-lg transition-colors"
          >
            <Square size={11} /> Parar
          </button>
          <button
            onClick={onCancel}
            className="ml-auto flex items-center gap-1 px-2.5 py-1.5 text-[11px] font-medium text-red-400 hover:text-red-300 hover:bg-red-900/20 rounded-lg border border-red-900/40 transition-colors"
          >
            <X size={10} /> Cancelar
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Main popup content ───────────────────────────────────────────────────────

export function PopupOverlayContent({
  runningTask,
  activePlannedTaskActions,
  onClose,
  onNavigatePlanning,
  onResize,
  onStartTask,
  onPlay,
  onPause,
  onResume,
  onStop,
  onCancel,
  onUpdateTask,
}: PopupOverlayContentProps) {
  const today = todayISO();
  const { tasks, reload, complete } = usePlannedTasksForDate(today);
  const { titles: trackedTitles } = useTrackedMeetingTitles();
  const { groups: completedGroups, totalSeconds: completedTotalSeconds } =
    useCompletedTasksForDate(today);
  const { projects } = useProjects();
  const { categories } = useCategories();
  const pending = tasks.filter((t) => !t.completedDates.includes(today));
  const [activeTab, setActiveTab] = useState<"planned" | "completed">("planned");

  const projectName = projects.find((p) => p.id === runningTask?.projectId)?.name;
  const categoryName = categories.find((c) => c.id === runningTask?.categoryId)?.name;
  const hasActions = activePlannedTaskActions.length > 0;
  const [confirmingStop, setConfirmingStop] = useState(false);

  // Reset confirm state whenever the running task changes (started/stopped).
  useEffect(() => {
    if (!runningTask) setConfirmingStop(false);
  }, [runningTask?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Resize based on state
  useEffect(() => {
    if (runningTask) {
      const execH = confirmingStop ? EXEC_H_CONFIRMING : EXEC_H;
      onResize(POPUP_W, HEADER_H + execH + (hasActions ? ACTIONS_SECTION_H : 0) + FOOTER_H);
    } else {
      // Altura fixa: abas + área de conteúdo com scroll interno, independente do
      // tamanho das listas (resolve o crescimento do popup em listas grandes).
      onResize(POPUP_W, HEADER_H + NEW_TASK_H + TABS_H + CONTENT_H + FOOTER_H);
    }
  }, [!!runningTask, hasActions, confirmingStop, onResize]); // eslint-disable-line react-hooks/exhaustive-deps

  async function handlePlay(task: PlannedTask) {
    await onPlay(task);
    await reload();
  }

  async function handleRepeat(group: TaskGroup) {
    const t = group.tasks[0];
    await onStartTask({
      name: t.name,
      projectId: t.projectId,
      categoryId: t.categoryId,
      billable: t.billable,
    });
  }

  async function handleOpenApp() {
    await emit(OVERLAY_EVENTS.OVERLAY_OPEN_APP);
  }

  return (
    <div className="w-full h-full flex flex-col bg-gray-900 border border-gray-700 rounded-xl shadow-2xl overflow-visible">
      {/* Header */}
      <div
        className="flex items-center justify-between px-3 bg-gray-800 border-b border-gray-700 shrink-0 rounded-t-xl overflow-hidden"
        style={{ height: HEADER_H }}
      >
        <span className="text-xs font-medium text-gray-300 select-none pointer-events-none truncate">
          {runningTask ? "Em execução" : "Tarefas de Hoje"}
        </span>
        <div className="flex items-center gap-1">
          <OverlayWorkspaceChip runningTask={runningTask} onStop={onStop} />
          <button
            onClick={onNavigatePlanning}
            title="Ir para planejamento"
            className="p-1 text-gray-400 hover:text-gray-200 hover:bg-gray-700 rounded-lg transition-colors"
          >
            <CalendarDays size={13} />
          </button>
          <button
            onClick={onClose}
            title="Fechar"
            className="p-1 text-gray-400 hover:text-gray-200 hover:bg-gray-700 rounded-lg transition-colors"
          >
            <X size={13} />
          </button>
        </div>
      </div>

      {/* ── Running state: focused execution view ── */}
      {runningTask ? (
        <ExecSection
          task={runningTask}
          projectName={projectName}
          categoryName={categoryName}
          projects={projects}
          categories={categories}
          actions={activePlannedTaskActions}
          confirmingStop={confirmingStop}
          setConfirmingStop={setConfirmingStop}
          onUpdateTask={onUpdateTask}
          onPause={onPause}
          onResume={onResume}
          onStop={onStop}
          onCancel={onCancel}
        />
      ) : (
        <>
          {/* ── Idle state: new task + planned list ── */}

          {/* New task button */}
          <div className="p-2 border-b border-gray-700/60 shrink-0" style={{ height: NEW_TASK_H }}>
            <button
              onClick={() => onStartTask({ billable: true })}
              className="w-full h-full flex items-center justify-center gap-1.5 text-xs text-gray-400 hover:text-white bg-gray-800 hover:bg-gray-700/80 rounded-lg transition-colors"
            >
              <Play size={11} fill="currentColor" />
              Nova tarefa
            </button>
          </div>

          {/* Tab bar */}
          <div className="flex border-b border-gray-800 shrink-0" style={{ height: TABS_H }}>
            <button
              onClick={() => setActiveTab("planned")}
              className={`flex-1 text-[11px] font-medium border-b-2 transition-colors ${
                activeTab === "planned"
                  ? "text-gray-200 border-blue-500"
                  : "text-gray-500 border-transparent hover:text-gray-300"
              }`}
            >
              Planejadas · {pending.length}
            </button>
            <button
              onClick={() => setActiveTab("completed")}
              className={`flex-1 text-[11px] font-medium border-b-2 transition-colors ${
                activeTab === "completed"
                  ? "text-gray-200 border-blue-500"
                  : "text-gray-500 border-transparent hover:text-gray-300"
              }`}
            >
              Executadas · {completedGroups.length}
            </button>
          </div>

          {/* Conteúdo da aba ativa (altura fixa, scroll interno) */}
          <div className="shrink-0" style={{ height: CONTENT_H }}>
            {activeTab === "planned" ? (
              <div className="h-full overflow-y-auto">
                {pending.length === 0 ? (
                  <div className="h-full flex items-center justify-center">
                    <p className="text-center text-gray-600 text-[11px]">Nenhuma tarefa pendente</p>
                  </div>
                ) : (
                  pending.map((task) => {
                    const project = projects.find((p) => p.id === task.projectId);
                    const category = categories.find((c) => c.id === task.categoryId);
                    const subtitle = [project?.name, category?.name].filter(Boolean).join(" · ");
                    const railColor = getProjectColor(task.projectId);

                    return (
                      <div
                        key={task.id}
                        className="relative flex items-center gap-2 px-3 border-b border-gray-800/70 hover:bg-gray-800/40 transition-colors"
                        style={{ height: ROW_H }}
                      >
                        <span
                          className="absolute left-0 top-2.5 bottom-2.5 w-0.5 rounded-r-full"
                          style={{ backgroundColor: railColor }}
                        />
                        <div className="flex-1 min-w-0 pl-1.5">
                          <div className="flex items-center gap-1 min-w-0">
                            <p className="text-[12px] font-medium text-gray-200 truncate leading-tight">
                              {task.name}
                            </p>
                            {trackedTitles.has((task.name ?? "").toLowerCase().trim()) && (
                              <span
                                className="shrink-0 flex items-center text-blue-400/80"
                                title="Rastreada — o app vai lembrar de iniciar esta reunião"
                              >
                                <Bell size={10} />
                              </span>
                            )}
                          </div>
                          {subtitle && (
                            <p className="text-[10px] text-gray-500 truncate leading-tight mt-0.5">
                              {subtitle}
                            </p>
                          )}
                        </div>
                        <button
                          onClick={() => void complete(task.id, today)}
                          title="Concluir"
                          className="p-1 text-gray-500 hover:text-blue-400 hover:bg-blue-900/20 rounded-lg transition-colors shrink-0"
                        >
                          <Check size={11} />
                        </button>
                        <button
                          onClick={() => handlePlay(task)}
                          title="Iniciar"
                          className="p-1 text-gray-500 hover:text-green-400 hover:bg-green-900/20 rounded-lg transition-colors shrink-0"
                        >
                          <Play size={11} fill="currentColor" />
                        </button>
                      </div>
                    );
                  })
                )}
              </div>
            ) : (
              <CompletedTasksSection
                groups={completedGroups}
                totalSeconds={completedTotalSeconds}
                projects={projects}
                categories={categories}
                onRepeat={handleRepeat}
              />
            )}
          </div>
        </>
      )}

      {/* Footer */}
      <div
        className="flex items-center px-3 border-t border-gray-700/60 shrink-0"
        style={{ height: FOOTER_H }}
      >
        <button
          onClick={handleOpenApp}
          className="ml-auto flex items-center gap-1 text-[11px] text-gray-500 hover:text-gray-300 transition-colors"
        >
          Abrir app
          <ArrowRight size={11} />
        </button>
      </div>
    </div>
  );
}
