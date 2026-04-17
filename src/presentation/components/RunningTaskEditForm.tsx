import { useState } from "react";
import type { Task } from "@domain/entities/Task";
import type { Project } from "@domain/entities/Project";
import type { Category } from "@domain/entities/Category";
import { Autocomplete } from "./Autocomplete";

interface RunningTaskEditFormProps {
  task: Task;
  projects: Project[];
  categories: Category[];
  focusField?: "name" | "project" | "category";
  onSave: (data: {
    name: string | null;
    projectId: string | null;
    categoryId: string | null;
    billable: boolean;
  }) => void;
  onCancel: () => void;
}

export function RunningTaskEditForm({
  task,
  projects,
  categories,
  focusField,
  onSave,
  onCancel,
}: RunningTaskEditFormProps) {
  const [name, setName] = useState(task.name ?? "");
  const [projectName, setProjectName] = useState(
    projects.find((p) => p.id === task.projectId)?.name ?? ""
  );
  const [categoryName, setCategoryName] = useState(
    categories.find((c) => c.id === task.categoryId)?.name ?? ""
  );
  const [billable, setBillable] = useState(task.billable);
  const [projectId, setProjectId] = useState<string | null>(task.projectId);
  const [categoryId, setCategoryId] = useState<string | null>(task.categoryId);

  function handleSave() {
    const pId = projects.find((p) => p.name === projectName)?.id ?? projectId ?? null;
    const cId = categories.find((c) => c.name === categoryName)?.id ?? categoryId ?? null;
    onSave({ name: name.trim() || null, projectId: pId, categoryId: cId, billable });
  }

  function handleFormKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Escape") {
      e.stopPropagation();
      onCancel();
    }
  }

  return (
    <div className="mt-3 space-y-2" onKeyDown={handleFormKeyDown}>
      <input
        type="text"
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter") handleSave(); }}
        placeholder="Nome (opcional)"
        autoFocus={focusField === "name" || !focusField}
        className="w-full px-2.5 py-1.5 text-sm bg-gray-800 border border-gray-700 rounded text-gray-100 placeholder-gray-500 focus:outline-none focus:border-blue-500"
      />
      <div className="flex gap-2">
        <Autocomplete
          value={projectName}
          onChange={setProjectName}
          onSelect={(o) => setProjectId(o.id)}
          onEnter={handleSave}
          options={projects}
          placeholder="Projeto"
          className="flex-1"
          autoFocus={focusField === "project"}
        />
        <Autocomplete
          value={categoryName}
          onChange={(v) => {
            setCategoryName(v);
            const cat = categories.find((c) => c.name === v);
            if (cat) setBillable(cat.defaultBillable);
          }}
          onSelect={(o) => {
            setCategoryId(o.id);
            const cat = categories.find((c) => c.id === o.id);
            if (cat) setBillable(cat.defaultBillable);
          }}
          onEnter={handleSave}
          options={categories}
          placeholder="Categoria"
          className="flex-1"
          autoFocus={focusField === "category"}
        />
      </div>
      <label className="flex items-center gap-2 text-sm text-gray-300 cursor-pointer">
        <input
          type="checkbox"
          checked={billable}
          onChange={(e) => setBillable(e.target.checked)}
          className="accent-blue-500"
        />
        Billable
      </label>
      <div className="flex gap-2 pt-1">
        <button
          onClick={handleSave}
          className="px-3 py-1.5 text-xs bg-blue-600 hover:bg-blue-500 text-white rounded"
        >
          Salvar
        </button>
        <button
          onClick={onCancel}
          className="px-3 py-1.5 text-xs text-gray-400 hover:text-gray-200"
        >
          Cancelar
        </button>
      </div>
    </div>
  );
}
