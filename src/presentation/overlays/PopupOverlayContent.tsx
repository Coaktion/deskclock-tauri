import type { Category } from "@domain/entities/Category";
import type { CustomField, CustomValues } from "@domain/entities/CustomField";
import type { PlannedTask, PlannedTaskAction } from "@domain/entities/PlannedTask";
import type { Project } from "@domain/entities/Project";
import type { Task } from "@domain/entities/Task";
import type { TaskGroup } from "@domain/utils/groupTasks";
import { countFilledCustomValues } from "@domain/usecases/customFields/countFilledCustomValues";
import { ActionChip } from "@presentation/components/ActionChip";
import { Autocomplete } from "@presentation/components/Autocomplete";
import { BillableChip, Input } from "@presentation/components/ui";
import { useCategories } from "@presentation/hooks/useCategories";
import { useCompletedTasksForDate } from "@presentation/hooks/useCompletedTasksForDate";
import { useCustomFields } from "@presentation/hooks/useCustomFields";
import { useProjectCategoryMap } from "@presentation/hooks/useProjectCategoryMap";
import { usePlannedTasksForDate } from "@presentation/hooks/usePlannedTasks";
import { useProjects } from "@presentation/hooks/useProjects";
import { useSubmitOnEnter } from "@presentation/hooks/useSubmitOnEnter";
import { CompletedTaskEditSheet } from "@presentation/overlays/CompletedTaskEditSheet";
import { CompletedTasksSection } from "@presentation/overlays/CompletedTasksSection";
import { PlannedTaskEditSheet } from "@presentation/overlays/PlannedTaskEditSheet";
import { RunningCustomFieldsSheet } from "@presentation/overlays/RunningCustomFieldsSheet";
import { useTaskTimer } from "@presentation/hooks/useTaskTimer";
import { POPUP_SIZE } from "@shared/utils/windowPosition";
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
  ListChecks,
  Pause,
  Pen,
  Play,
  Square,
  X,
} from "lucide-react";
import { useTrackedMeetingTitles } from "@presentation/hooks/useTrackedMeetingTitles";
import { useEffect, useRef, useState } from "react";

// Alturas em px de um conteúdo que é todo em rem: qualquer mudança na raiz do
// documento as desatualiza por inteiro, e a janela passa a cortar o rodapé.
const POPUP_W = POPUP_SIZE.width;
const HEADER_H = 42;
const FOOTER_H = 39;

// Idle state layout
const NEW_TASK_H = 51;
const TABS_H = 37;
const CONTENT_H = 215; // área da aba ativa (altura fixa; a lista rola internamente)
const ROW_H = 50;

// Running state layout (execution section fills popup body)
const EXEC_H = 300; // status + name + timer + start-time + project + category + billable + divider + controls
const EXEC_H_CONFIRMING = 345; // EXEC_H + extra rows for end-time input + Concluída/Pendente buttons
const ACTIONS_SECTION_H = 55; // section label + one row of action chips
// Uma linha só, com o chip que abre o painel — e por isso constante: os campos
// personalizados são quantos o usuário quiser, e empilhá-los aqui faria a altura
// da janela depender do cadastro dele.
const CUSTOM_FIELDS_ROW_H = 41; // chip (32) + o gap-2 da coluna

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
  /**
   * Avisa a janela que há um modal aberto. Enquanto houver, o popup não pode
   * sumir no blur nem no ESC — fechar sozinho descartaria a edição em curso.
   */
  onModalOpenChange: (open: boolean) => void;
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
    customValues?: CustomValues;
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
  customFields: CustomField[];
  actions: PlannedTaskAction[];
  confirmingStop: boolean;
  setConfirmingStop: (v: boolean) => void;
  onOpenCustomFields: () => void;
  onUpdateTask: (input: {
    name?: string | null;
    projectId?: string | null;
    categoryId?: string | null;
    billable?: boolean;
    startTime?: string;
    customValues?: CustomValues;
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
  customFields,
  actions,
  confirmingStop,
  setConfirmingStop,
  onOpenCustomFields,
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

  const handleConfirmStopKeyDown = useSubmitOnEnter(
    () => {
      setConfirmingStop(false);
      void onStop(true, endTimeResolved.iso);
    },
    { disabled: !!endTimeResolved.error }
  );

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
    if (editProjectIdRef.current !== task.projectId) {
      // Mesma regra do `onSelect`: projeto novo, categoria zerada.
      editCategoryIdRef.current = null;
      setEditCategoryName("");
      await onUpdateTask({ projectId: editProjectIdRef.current, categoryId: null });
    }
  }

  // ── category ──────────────────────────────────────────────────────────────
  // Só as `options`: `categoryName` continua vindo do catálogo cheio, ou
  // desassociar a categoria apagaria o rótulo do chip da tarefa que já a usa.
  const { categoriesFor } = useProjectCategoryMap();
  const categoryOptions = categoriesFor(categories, task.projectId);
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
          className={`w-1.5 h-1.5 rounded-full shrink-0 ${isRunning ? "animate-pulse bg-accent" : "bg-paused"}`}
        />
        <span
          className={`text-overline uppercase ${isRunning ? "text-accent-text" : "text-paused"}`}
        >
          {isRunning ? "Rodando" : "Pausada"}
        </span>
      </div>

      {/* Name */}
      {editingName ? (
        <Input
          autoFocus
          variant="plain"
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
          className="font-medium border-b border-border focus:border-accent"
        />
      ) : (
        <button
          onClick={() => setEditingName(true)}
          className="group flex items-center gap-1 text-left text-sm font-medium text-fg hover:text-fg leading-snug transition-colors cursor-text w-full"
        >
          <span className="truncate">
            {task.name ?? <span className="text-fg-muted italic">(sem nome)</span>}
          </span>
          <Pen size={14} className="shrink-0 opacity-0 group-hover:opacity-60 transition-opacity" />
        </button>
      )}

      {/* Timer */}
      <p
        className={`font-mono text-xl font-semibold tabular-nums leading-none ${isRunning ? "text-accent-text" : "text-paused"}`}
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
              // A categoria vai junto: o recorte de opções mudou, e aqui a
              // edição é gravada na hora — deixá-la para trás manteria na
              // tarefa uma categoria que o chip já não oferece.
              editCategoryIdRef.current = null;
              setEditCategoryName("");
              void onUpdateTask({ projectId: o.id, categoryId: null });
              setEditingProject(false);
            }}
            options={projects}
            placeholder="Projeto"
            className="w-full"
            dropUp
          />
        </div>
      ) : (
        <button
          onClick={() => openProjectEdit()}
          onKeyDown={chipTypeahead(openProjectEdit)}
          className={`text-left self-start flex items-center gap-1.5 px-2.5 py-1 text-sm rounded-control border transition-colors ${
            projectName
              ? "text-fg-secondary bg-raised border-border hover:border-fg-muted"
              : "text-fg-muted bg-raised/50 border-dashed border-border/50 hover:border-border"
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
            options={categoryOptions}
            placeholder="Categoria"
            className="w-full"
            dropUp
          />
        </div>
      ) : (
        <button
          onClick={() => openCategoryEdit()}
          onKeyDown={chipTypeahead(openCategoryEdit)}
          className={`self-start flex items-center gap-1.5 px-2.5 py-1 text-sm rounded-control border transition-colors ${
            categoryName
              ? "text-fg-secondary bg-raised border-border hover:border-fg-muted"
              : "text-fg-muted bg-raised/50 border-dashed border-border/50 hover:border-border"
          }`}
        >
          {categoryName ?? "+ Categoria"}
        </button>
      )}

      <div className="flex gap-1.5 items-center">
        <BillableChip
          billable={task.billable}
          onToggle={() => void onUpdateTask({ billable: !task.billable })}
        />

        {/* Start time */}
        {editingStartTime ? (
          <div className="flex items-center gap-2">
            <Clock size={14} className="text-fg-muted shrink-0" />
            <Input
              autoFocus
              type="time"
              variant="plain"
              size="sm"
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
              className="flex-1 border-b border-border focus:border-accent text-fg-secondary!"
            />
          </div>
        ) : (
          <button
            onClick={() => setEditingStartTime(true)}
            className="self-start flex items-center gap-1.5 px-2.5 py-1 text-sm text-fg-secondary bg-raised border border-border rounded-control hover:border-fg-muted transition-colors"
          >
            <Clock size={14} className="text-fg-muted shrink-0" />
            {fmtTime(task.startTime)}
          </button>
        )}
      </div>

      {/* Campos personalizados: só o chip fica aqui, com o quanto já foi
          preenchido. Os campos em si abrem no painel que cobre o popup — é o que
          mantém a altura da janela independente de quantos campos existem. */}
      {customFields.length > 0 && (
        <button
          onClick={onOpenCustomFields}
          className={`self-start flex items-center gap-1.5 px-2.5 py-1 text-sm rounded-control border transition-colors ${
            countFilledCustomValues(customFields, task.customValues) > 0
              ? "text-fg-secondary bg-raised border-border hover:border-fg-muted"
              : "text-fg-muted bg-raised/50 border-dashed border-border/50 hover:border-border"
          }`}
        >
          <ListChecks size={14} className="shrink-0" />
          Campos · {countFilledCustomValues(customFields, task.customValues)}/{customFields.length}
        </button>
      )}

      {/* Actions section */}
      {actions.length > 0 && (
        <div>
          <p className="text-overline uppercase text-fg-muted mb-1.5">Ações</p>
          <div className="flex flex-wrap gap-1.5">
            {actions.map((action, i) => (
              <ActionChip key={i} action={action} />
            ))}
          </div>
        </div>
      )}

      {/* Divider */}
      <div className="border-t border-border-subtle mt-auto" />

      {/* Controls */}
      {confirmingStop ? (
        // Enter no campo de hora encerra como **Concluída** — a ação primária do
        // painel, e a única que cabe num atalho: "Pendente" é a escolha
        // alternativa, e continua exigindo o clique que a diferencia.
        <div className="flex flex-col gap-1.5" onKeyDown={handleConfirmStopKeyDown}>
          <div className="flex items-center gap-2">
            <span className="text-sm text-fg-secondary">Encerrar às</span>
            <div className="flex items-center gap-1.5 flex-1">
              <Clock size={14} className="text-fg-muted shrink-0" />
              <Input
                type="time"
                variant="plain"
                size="sm"
                value={endTimeInput}
                onChange={(e) => {
                  setEndTimeInput(e.target.value);
                  setEndTimeTouched(true);
                }}
                className={`flex-1 border-b ${
                  endTimeResolved.error
                    ? "border-danger focus:border-danger"
                    : "border-border focus:border-accent"
                }`}
              />
            </div>
            <button
              onClick={() => setConfirmingStop(false)}
              className="p-1 text-fg-muted hover:text-accent-text rounded-control transition-colors"
              title="Retomar"
            >
              <Play size={14} />
            </button>
          </div>
          {endTimeResolved.error && (
            <span className="text-xs text-danger">{endTimeResolved.error}</span>
          )}
          <div className="flex items-center gap-1.5">
            <button
              disabled={!!endTimeResolved.error}
              onClick={() => {
                setConfirmingStop(false);
                void onStop(true, endTimeResolved.iso);
              }}
              className="flex items-center gap-1 px-2 py-1 text-sm bg-billable/80 hover:bg-billable disabled:bg-border disabled:text-fg-muted disabled:cursor-not-allowed text-white rounded-control transition-colors"
            >
              <CheckCircle2 size={14} /> Concluída
            </button>
            <button
              disabled={!!endTimeResolved.error}
              onClick={() => {
                setConfirmingStop(false);
                void onStop(false, endTimeResolved.iso);
              }}
              className="flex items-center gap-1 px-2 py-1 text-sm bg-border hover:opacity-90 disabled:bg-raised disabled:text-fg-muted disabled:cursor-not-allowed text-fg rounded-control transition"
            >
              <Clock size={14} /> Pendente
            </button>
          </div>
        </div>
      ) : (
        <div className="flex items-center gap-1.5">
          <button
            onClick={isRunning ? onPause : onResume}
            className="flex items-center gap-1 px-2.5 py-1.5 text-sm font-medium text-fg-secondary hover:text-fg bg-raised hover:bg-border rounded-control transition-colors"
          >
            {isRunning ? (
              <>
                <Pause size={14} /> Pausar
              </>
            ) : (
              <>
                <Play size={14} /> Retomar
              </>
            )}
          </button>
          <button
            onClick={openConfirmStop}
            className="flex items-center gap-1 px-2.5 py-1.5 text-sm font-medium text-fg-secondary hover:text-fg bg-raised hover:bg-border rounded-control transition-colors"
          >
            <Square size={14} /> Parar
          </button>
          <button
            onClick={onCancel}
            className="ml-auto flex items-center gap-1 px-2.5 py-1.5 text-sm font-medium text-danger hover:bg-danger/10 rounded-control border border-danger/40 transition-colors"
          >
            <X size={14} /> Cancelar
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
  onModalOpenChange,
  onStartTask,
  onPlay,
  onPause,
  onResume,
  onStop,
  onCancel,
  onUpdateTask,
}: PopupOverlayContentProps) {
  const today = todayISO();
  const { tasks, reload, complete, update } = usePlannedTasksForDate(today);
  const { titles: trackedTitles } = useTrackedMeetingTitles();
  const {
    groups: completedGroups,
    totalSeconds: completedTotalSeconds,
    updateGroup: updateCompletedGroup,
  } = useCompletedTasksForDate(today);
  const { projects } = useProjects();
  const { categories } = useCategories();
  const { activeFields } = useCustomFields();
  const pending = tasks.filter((t) => !t.completedDates.includes(today));
  const [activeTab, setActiveTab] = useState<"planned" | "completed">("planned");

  const projectName = projects.find((p) => p.id === runningTask?.projectId)?.name;
  const categoryName = categories.find((c) => c.id === runningTask?.categoryId)?.name;
  const hasActions = activePlannedTaskActions.length > 0;
  const hasCustomFields = activeFields.length > 0;
  const [confirmingStop, setConfirmingStop] = useState(false);
  const [editingTask, setEditingTask] = useState<PlannedTask | null>(null);
  const [editingCompleted, setEditingCompleted] = useState<TaskGroup | null>(null);
  const [editingCustomFields, setEditingCustomFields] = useState(false);

  // Reset confirm state whenever the running task changes (started/stopped).
  // O painel de campos vai junto: sem tarefa ele editaria o que já não está em
  // execução, e o `Salvar` gravaria numa tarefa parada por outra janela.
  useEffect(() => {
    if (!runningTask) {
      setConfirmingStop(false);
      setEditingCustomFields(false);
    }
  }, [runningTask?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Os três painéis seguram o fechamento automático pelo mesmo motivo: o popup
  // some no blur, e todos eles guardam texto digitado que ninguém salvou ainda.
  useEffect(() => {
    onModalOpenChange(!!editingTask || !!editingCompleted || editingCustomFields);
  }, [editingTask, editingCompleted, editingCustomFields, onModalOpenChange]);

  // Resize based on state. A edição de planejada **não** entra aqui: o painel
  // cabe no popup como ele já é, e crescer a janela para editar tiraria o
  // overlay do lugar onde o usuário o deixou.
  useEffect(() => {
    if (runningTask) {
      const execH = confirmingStop ? EXEC_H_CONFIRMING : EXEC_H;
      onResize(
        POPUP_W,
        HEADER_H +
          execH +
          (hasActions ? ACTIONS_SECTION_H : 0) +
          (hasCustomFields ? CUSTOM_FIELDS_ROW_H : 0) +
          FOOTER_H
      );
    } else {
      // Altura fixa: abas + área de conteúdo com scroll interno, independente do
      // tamanho das listas (resolve o crescimento do popup em listas grandes).
      onResize(POPUP_W, HEADER_H + NEW_TASK_H + TABS_H + CONTENT_H + FOOTER_H);
    }
  }, [!!runningTask, hasActions, hasCustomFields, confirmingStop, onResize]); // eslint-disable-line react-hooks/exhaustive-deps

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
    <div className="relative w-full h-full flex flex-col bg-surface border border-border rounded-card shadow-2xl overflow-visible">
      {/* Header */}
      <div
        className="flex items-center justify-between px-3 bg-raised border-b border-border shrink-0 rounded-t-card overflow-hidden"
        style={{ height: HEADER_H }}
      >
        <span className="text-sm font-medium text-fg-secondary select-none pointer-events-none truncate">
          {runningTask ? "Em execução" : "Tarefas de Hoje"}
        </span>
        <div className="flex items-center gap-1">
          <OverlayWorkspaceChip runningTask={runningTask} onStop={onStop} />
          <button
            onClick={onNavigatePlanning}
            title="Ir para planejamento"
            className="p-1 text-fg-secondary hover:text-fg hover:bg-border rounded-control transition-colors"
          >
            <CalendarDays size={14} />
          </button>
          <button
            onClick={onClose}
            title="Fechar"
            className="p-1 text-fg-secondary hover:text-fg hover:bg-border rounded-control transition-colors"
          >
            <X size={14} />
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
          customFields={activeFields}
          actions={activePlannedTaskActions}
          confirmingStop={confirmingStop}
          setConfirmingStop={setConfirmingStop}
          onOpenCustomFields={() => setEditingCustomFields(true)}
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
          <div className="p-2 border-b border-border/60 shrink-0" style={{ height: NEW_TASK_H }}>
            <button
              onClick={() => onStartTask({ billable: true })}
              className="w-full h-full flex items-center justify-center gap-1.5 text-sm text-fg-secondary hover:text-fg bg-raised hover:bg-border/80 rounded-control transition-colors"
            >
              <Play size={14} fill="currentColor" />
              Nova tarefa
            </button>
          </div>

          {/* Tab bar */}
          <div className="flex border-b border-border-subtle shrink-0" style={{ height: TABS_H }}>
            <button
              onClick={() => setActiveTab("planned")}
              className={`flex-1 text-sm font-medium border-b-2 transition-colors ${
                activeTab === "planned"
                  ? "text-fg border-accent"
                  : "text-fg-muted border-transparent hover:text-fg-secondary"
              }`}
            >
              Planejadas · {pending.length}
            </button>
            <button
              onClick={() => setActiveTab("completed")}
              className={`flex-1 text-sm font-medium border-b-2 transition-colors ${
                activeTab === "completed"
                  ? "text-fg border-accent"
                  : "text-fg-muted border-transparent hover:text-fg-secondary"
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
                    <p className="text-center text-fg-muted text-xs">Nenhuma tarefa pendente</p>
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
                        className="relative flex items-center gap-2 px-3 border-b border-border-subtle/70 hover:bg-raised/40 transition-colors"
                        style={{ height: ROW_H }}
                      >
                        <span
                          className="absolute left-0 top-2.5 bottom-2.5 w-0.5 rounded-r-full"
                          style={{ backgroundColor: railColor }}
                        />
                        <div className="flex-1 min-w-0 pl-1.5">
                          <div className="flex items-center gap-1 min-w-0">
                            <p className="text-sm font-medium text-fg truncate leading-tight">
                              {task.name}
                            </p>
                            {trackedTitles.has((task.name ?? "").toLowerCase().trim()) && (
                              <span
                                className="shrink-0 flex items-center text-accent-text/80"
                                title="Rastreada — o app vai lembrar de iniciar esta reunião"
                              >
                                <Bell size={14} />
                              </span>
                            )}
                          </div>
                          {subtitle && (
                            <p className="text-xs text-fg-muted truncate leading-tight mt-0.5">
                              {subtitle}
                            </p>
                          )}
                        </div>
                        <button
                          onClick={() => setEditingTask(task)}
                          title="Editar"
                          className="p-1 text-fg-muted hover:text-fg hover:bg-border/40 rounded-control transition-colors shrink-0"
                        >
                          <Pen size={14} />
                        </button>
                        <button
                          onClick={() => void complete(task.id, today)}
                          title="Concluir"
                          className="p-1 text-fg-muted hover:text-accent-text hover:bg-accent/10 rounded-control transition-colors shrink-0"
                        >
                          <Check size={14} />
                        </button>
                        <button
                          onClick={() => handlePlay(task)}
                          title="Iniciar"
                          className="p-1 text-fg-muted hover:text-billable hover:bg-billable/10 rounded-control transition-colors shrink-0"
                        >
                          <Play size={14} fill="currentColor" />
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
                onEdit={setEditingCompleted}
              />
            )}
          </div>
        </>
      )}

      {/* Footer */}
      <div
        className="flex items-center px-3 border-t border-border/60 shrink-0"
        style={{ height: FOOTER_H }}
      >
        <button
          onClick={handleOpenApp}
          className="ml-auto flex items-center gap-1 text-sm text-fg-muted hover:text-fg-secondary transition-colors"
        >
          Abrir app
          <ArrowRight size={14} />
        </button>
      </div>

      {/* Edição da planejada sem sair do overlay e sem mexer no tamanho da
          janela. Os campos são os do modal do planejamento, pelo mesmo
          `usePlannedTaskEditor` — só a disposição muda (§9.4). */}
      {editingTask && (
        <PlannedTaskEditSheet
          task={editingTask}
          projects={projects}
          categories={categories}
          onSave={update}
          onClose={() => setEditingTask(null)}
        />
      )}

      {/* Edição da executada, no mesmo desenho de painel. Ela edita o **grupo**
          que a linha representa (§6.3) — os campos da chave valem para todas as
          irmãs, e só o grupo de uma tarefa mostra horário. */}
      {editingCompleted && (
        <CompletedTaskEditSheet
          group={editingCompleted}
          projects={projects}
          categories={categories}
          onSave={updateCompletedGroup}
          onClose={() => setEditingCompleted(null)}
        />
      )}

      {/* Campos personalizados da tarefa em execução, no mesmo desenho de painel
          e pela mesma razão: a janela não cresce. */}
      {editingCustomFields && runningTask && (
        <RunningCustomFieldsSheet
          task={runningTask}
          fields={activeFields}
          onSave={(customValues) => onUpdateTask({ customValues })}
          onClose={() => setEditingCustomFields(false)}
        />
      )}
    </div>
  );
}
