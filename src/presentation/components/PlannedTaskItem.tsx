import { useState, useRef, useEffect } from "react";
import {
  Play,
  Check,
  Copy,
  Trash2,
  RotateCcw,
  Pencil,
  X,
  Zap,
  Plus,
  ExternalLink,
  FolderOpen,
} from "lucide-react";
import { Autocomplete } from "@presentation/components/Autocomplete";
import { DatePickerInput } from "@presentation/components/DatePickerInput";
import type { PlannedTask, PlannedTaskAction } from "@domain/entities/PlannedTask";
import type { Project } from "@domain/entities/Project";
import type { Category } from "@domain/entities/Category";
import type { UUID } from "@shared/types";

interface UpdateInput {
  name?: string;
  projectId?: UUID | null;
  categoryId?: UUID | null;
  billable?: boolean;
  scheduleDate?: string | null;
  actions?: PlannedTaskAction[];
}

interface PlannedTaskItemProps {
  task: PlannedTask;
  dateISO: string;
  projects: Project[];
  categories: Category[];
  showDateField?: boolean;
  playDisabled?: boolean;
  onPlay: (task: PlannedTask) => void;
  onUpdate: (id: string, input: UpdateInput) => Promise<void>;
  onComplete: (id: string, date: string) => void;
  onUncomplete: (id: string, date: string) => void;
  onDuplicate: (id: string) => void;
  onDelete: (id: string) => void;
}

export function PlannedTaskItem({
  task,
  dateISO,
  projects,
  categories,
  showDateField = false,
  playDisabled = false,
  onPlay,
  onUpdate,
  onComplete,
  onUncomplete,
  onDuplicate,
  onDelete,
}: PlannedTaskItemProps) {
  const isCompleted = task.completedDates.includes(dateISO);
  const project = projects.find((p) => p.id === task.projectId);
  const category = categories.find((c) => c.id === task.categoryId);

  // Edit form state
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(task.name);
  const [projectId, setProjectId] = useState<UUID | null>(task.projectId);
  const [projectName, setProjectName] = useState(project?.name ?? "");
  const [categoryId, setCategoryId] = useState<UUID | null>(task.categoryId);
  const [categoryName, setCategoryName] = useState(category?.name ?? "");
  const [billable, setBillable] = useState(task.billable);
  const [scheduleDate, setScheduleDate] = useState(task.scheduleDate ?? "");
  const dirty = useRef(false);
  const formRef = useRef<HTMLDivElement>(null);

  // Actions panel state
  const [showActions, setShowActions] = useState(false);
  const [newActionType, setNewActionType] = useState<PlannedTaskAction["type"]>("open_url");
  const [newActionValue, setNewActionValue] = useState("");

  const canEditDate = showDateField && task.scheduleType === "specific_date";

  // Sincroniza estado local quando a task mudar externamente
  useEffect(() => {
    if (!editing) {
      setName(task.name);
      setProjectId(task.projectId);
      setProjectName(projects.find((p) => p.id === task.projectId)?.name ?? "");
      setCategoryId(task.categoryId);
      setCategoryName(categories.find((c) => c.id === task.categoryId)?.name ?? "");
      setBillable(task.billable);
      setScheduleDate(task.scheduleDate ?? "");
    }
  }, [task, editing, projects, categories]);

  function startEdit() {
    dirty.current = false;
    setShowActions(false);
    setEditing(true);
  }

  async function save() {
    if (!dirty.current) {
      setEditing(false);
      return;
    }
    await onUpdate(task.id, {
      name: name.trim() || task.name,
      projectId,
      categoryId,
      billable,
      ...(canEditDate ? { scheduleDate: scheduleDate || null } : {}),
    });
    dirty.current = false;
    setEditing(false);
  }

  function cancel() {
    setName(task.name);
    setProjectId(task.projectId);
    setProjectName(project?.name ?? "");
    setCategoryId(task.categoryId);
    setCategoryName(category?.name ?? "");
    setBillable(task.billable);
    setScheduleDate(task.scheduleDate ?? "");
    dirty.current = false;
    setEditing(false);
  }

  // Salva ao clicar fora do formulário de edição
  useEffect(() => {
    if (!editing) return;
    function handleOutside(e: MouseEvent) {
      const target = e.target as Element;
      if (target.closest("[data-datepicker-portal]")) return;
      if (formRef.current && !formRef.current.contains(target)) {
        void save();
      }
    }
    document.addEventListener("mousedown", handleOutside);
    return () => document.removeEventListener("mousedown", handleOutside);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editing, name, projectId, categoryId, billable, scheduleDate]);

  // Gerenciamento de ações
  async function handleAddAction() {
    if (!newActionValue.trim()) return;
    const updated = [...task.actions, { type: newActionType, value: newActionValue.trim() }];
    await onUpdate(task.id, { actions: updated });
    setNewActionValue("");
  }

  async function handleDeleteAction(index: number) {
    const updated = task.actions.filter((_, i) => i !== index);
    await onUpdate(task.id, { actions: updated });
  }

  function handleFormKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Escape") {
      e.stopPropagation();
      cancel();
    }
  }

  function handleNameKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter") void save();
  }

  if (editing) {
    return (
      <>
        <div
          ref={formRef}
          onKeyDown={handleFormKeyDown}
          className="flex flex-col gap-2 px-4 py-3 border-b border-gray-700 bg-gray-800/60"
        >
          <div className="flex gap-2">
            <input
              autoFocus
              type="text"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                dirty.current = true;
              }}
              onKeyDown={handleNameKeyDown}
              className="flex-1 px-2.5 py-1.5 text-sm bg-gray-900 border border-gray-600 rounded text-gray-100 placeholder-gray-500 focus:outline-none focus:border-blue-500"
            />
            {canEditDate && (
              <DatePickerInput
                value={scheduleDate}
                onChange={(v) => {
                  setScheduleDate(v);
                  dirty.current = true;
                }}
                className="w-36 shrink-0"
              />
            )}
          </div>
          <div className="flex gap-2">
            <Autocomplete
              value={projectName}
              onChange={(v) => {
                setProjectName(v);
                dirty.current = true;
              }}
              onSelect={(o) => {
                setProjectId(o.id);
                setProjectName(o.name);
                dirty.current = true;
              }}
              options={projects}
              placeholder="Projeto"
              className="flex-1"
            />
            <Autocomplete
              value={categoryName}
              onChange={(v) => {
                setCategoryName(v);
                dirty.current = true;
              }}
              onSelect={(o) => {
                setCategoryId(o.id);
                setCategoryName(o.name);
                const cat = categories.find((c) => c.id === o.id);
                if (cat) {
                  setBillable(cat.defaultBillable);
                }
                dirty.current = true;
              }}
              options={categories}
              placeholder="Categoria"
              className="flex-1"
            />
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                setBillable((b) => !b);
                dirty.current = true;
              }}
              className={`px-2.5 py-1.5 text-xs rounded border transition-colors shrink-0 ${
                billable
                  ? "bg-green-900/40 border-green-700 text-green-400"
                  : "bg-gray-900 border-gray-600 text-gray-400"
              }`}
            >
              {billable ? "Bill." : "N/Bill."}
            </button>
          </div>
          <div className="flex justify-end gap-2">
            <button
              onMouseDown={(e) => e.preventDefault()}
              onClick={cancel}
              className="px-3 py-1 text-xs text-gray-400 hover:text-gray-200 hover:bg-gray-700 rounded transition-colors flex items-center gap-1"
            >
              <X size={12} /> Cancelar
            </button>
            <button
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => void save()}
              className="px-3 py-1 text-xs bg-blue-600 hover:bg-blue-500 text-white rounded transition-colors"
            >
              Salvar
            </button>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <div
        className={`flex items-center gap-3 px-4 py-3 border-b border-gray-800 hover:bg-gray-800/40 transition-colors group ${
          isCompleted ? "opacity-50" : ""
        }`}
      >
        <div className="flex-1 min-w-0">
          <p className={`text-sm text-gray-100 truncate ${isCompleted ? "line-through" : ""}`}>
            {task.name}
          </p>
          {(project || category) && (
            <p className="text-xs text-gray-500 truncate mt-0.5">
              {[project?.name, category?.name].filter(Boolean).join(" · ")}
            </p>
          )}
        </div>

        <div className="flex items-center gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
          {!isCompleted && !playDisabled && (
            <button
              onClick={() => onPlay(task)}
              title="Iniciar"
              className="p-1.5 text-gray-400 hover:text-green-400 hover:bg-green-900/20 rounded transition-colors"
            >
              <Play size={14} />
            </button>
          )}

          <button
            onClick={startEdit}
            title="Editar"
            className="p-1.5 text-gray-400 hover:text-blue-400 hover:bg-blue-900/20 rounded transition-colors"
          >
            <Pencil size={14} />
          </button>

          <button
            onClick={() =>
              isCompleted ? onUncomplete(task.id, dateISO) : onComplete(task.id, dateISO)
            }
            title={isCompleted ? "Marcar como pendente" : "Concluir"}
            className="p-1.5 text-gray-400 hover:text-blue-400 hover:bg-blue-900/20 rounded transition-colors"
          >
            {isCompleted ? <RotateCcw size={14} /> : <Check size={14} />}
          </button>

          <button
            onClick={() => {
              setEditing(false);
              setShowActions((v) => !v);
            }}
            title="Ações"
            className={`relative p-1.5 rounded transition-colors ${
              showActions
                ? "text-yellow-400 bg-yellow-900/20"
                : "text-gray-400 hover:text-yellow-400 hover:bg-yellow-900/20"
            }`}
          >
            <Zap size={14} />
            {task.actions.length > 0 && (
              <span className="absolute -top-0.5 -right-0.5 w-3.5 h-3.5 text-[9px] bg-yellow-500 text-black rounded-full flex items-center justify-center font-bold leading-none">
                {task.actions.length}
              </span>
            )}
          </button>

          <button
            onClick={() => onDuplicate(task.id)}
            title="Duplicar"
            className="p-1.5 text-gray-400 hover:text-gray-200 hover:bg-gray-700 rounded transition-colors"
          >
            <Copy size={14} />
          </button>

          <button
            onClick={() => onDelete(task.id)}
            title="Excluir"
            className="p-1.5 text-gray-400 hover:text-red-400 hover:bg-red-900/20 rounded transition-colors"
          >
            <Trash2 size={14} />
          </button>
        </div>
      </div>

      {showActions && (
        <div className="px-4 py-3 border-b border-gray-700 bg-gray-800/40">
          {task.actions.length > 0 && (
            <ul className="mb-2 space-y-1">
              {task.actions.map((action, i) => (
                <li key={i} className="flex items-center gap-2">
                  <span
                    className={`shrink-0 p-1 rounded ${action.type === "open_url" ? "text-blue-400" : "text-purple-400"}`}
                  >
                    {action.type === "open_url" ? (
                      <ExternalLink size={12} />
                    ) : (
                      <FolderOpen size={12} />
                    )}
                  </span>
                  <span className="flex-1 text-xs text-gray-300 truncate" title={action.value}>
                    {action.value}
                  </span>
                  <button
                    onClick={() => handleDeleteAction(i)}
                    className="shrink-0 text-gray-600 hover:text-red-400 transition-colors"
                    title="Remover"
                  >
                    <X size={12} />
                  </button>
                </li>
              ))}
            </ul>
          )}
          <div className="flex gap-1.5">
            <select
              value={newActionType}
              onChange={(e) => setNewActionType(e.target.value as PlannedTaskAction["type"])}
              className="px-2 py-1 text-xs bg-gray-900 border border-gray-700 rounded text-gray-300 focus:outline-none focus:border-blue-500"
            >
              <option value="open_url">URL</option>
              <option value="open_file">Arquivo</option>
            </select>
            <input
              type="text"
              value={newActionValue}
              onChange={(e) => setNewActionValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void handleAddAction();
              }}
              placeholder={newActionType === "open_url" ? "https://..." : "/caminho/arquivo"}
              className="flex-1 px-2 py-1 text-xs bg-gray-900 border border-gray-700 rounded text-gray-100 placeholder-gray-500 focus:outline-none focus:border-blue-500"
            />
            <button
              onClick={() => void handleAddAction()}
              disabled={!newActionValue.trim()}
              className="px-2 py-1 text-xs bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white rounded transition-colors"
            >
              <Plus size={12} />
            </button>
          </div>
        </div>
      )}
    </>
  );
}
