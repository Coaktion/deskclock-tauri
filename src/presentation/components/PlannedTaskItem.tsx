import { useState, useRef, useEffect } from "react";
import { Play, Check, Copy, Trash2, RotateCcw, Pencil, X } from "lucide-react";
import { Autocomplete } from "@presentation/components/Autocomplete";
import type { PlannedTask } from "@domain/entities/PlannedTask";
import type { Project } from "@domain/entities/Project";
import type { Category } from "@domain/entities/Category";
import type { UUID } from "@shared/types";

interface UpdateInput {
  name?: string;
  projectId?: UUID | null;
  categoryId?: UUID | null;
  billable?: boolean;
}

interface PlannedTaskItemProps {
  task: PlannedTask;
  dateISO: string;
  projects: Project[];
  categories: Category[];
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

  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(task.name);
  const [projectId, setProjectId] = useState<UUID | null>(task.projectId);
  const [projectName, setProjectName] = useState(project?.name ?? "");
  const [categoryId, setCategoryId] = useState<UUID | null>(task.categoryId);
  const [categoryName, setCategoryName] = useState(category?.name ?? "");
  const [billable, setBillable] = useState(task.billable);
  const dirty = useRef(false);
  const formRef = useRef<HTMLDivElement>(null);

  // Sincroniza estado local quando a task mudar externamente
  useEffect(() => {
    if (!editing) {
      setName(task.name);
      setProjectId(task.projectId);
      setProjectName(projects.find((p) => p.id === task.projectId)?.name ?? "");
      setCategoryId(task.categoryId);
      setCategoryName(categories.find((c) => c.id === task.categoryId)?.name ?? "");
      setBillable(task.billable);
    }
  }, [task, editing, projects, categories]);

  function startEdit() {
    dirty.current = false;
    setEditing(true);
  }

  async function save() {
    if (!dirty.current) { setEditing(false); return; }
    await onUpdate(task.id, { name: name.trim() || task.name, projectId, categoryId, billable });
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
    dirty.current = false;
    setEditing(false);
  }

  // Salva ao clicar fora do formulário
  useEffect(() => {
    if (!editing) return;
    function handleOutside(e: MouseEvent) {
      if (formRef.current && !formRef.current.contains(e.target as Node)) {
        void save();
      }
    }
    document.addEventListener("mousedown", handleOutside);
    return () => document.removeEventListener("mousedown", handleOutside);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editing, name, projectId, categoryId, billable]);

  if (editing) {
    return (
      <div
        ref={formRef}
        className="flex flex-col gap-2 px-4 py-3 border-b border-gray-700 bg-gray-800/60"
      >
        <input
          autoFocus
          type="text"
          value={name}
          onChange={(e) => { setName(e.target.value); dirty.current = true; }}
          onKeyDown={(e) => { if (e.key === "Enter") void save(); if (e.key === "Escape") cancel(); }}
          className="w-full px-2.5 py-1.5 text-sm bg-gray-900 border border-gray-600 rounded text-gray-100 placeholder-gray-500 focus:outline-none focus:border-blue-500"
        />
        <div className="flex gap-2">
          <Autocomplete
            value={projectName}
            onChange={(v) => { setProjectName(v); dirty.current = true; }}
            onSelect={(o) => { setProjectId(o.id); setProjectName(o.name); dirty.current = true; }}
            options={projects}
            placeholder="Projeto"
            className="flex-1"
          />
          <Autocomplete
            value={categoryName}
            onChange={(v) => { setCategoryName(v); dirty.current = true; }}
            onSelect={(o) => {
              setCategoryId(o.id);
              setCategoryName(o.name);
              const cat = categories.find((c) => c.id === o.id);
              if (cat) { setBillable(cat.defaultBillable); }
              dirty.current = true;
            }}
            options={categories}
            placeholder="Categoria"
            className="flex-1"
          />
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()} // evita trigger do outside click
            onClick={() => { setBillable((b) => !b); dirty.current = true; }}
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
    );
  }

  return (
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
        {!isCompleted && (
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
  );
}
