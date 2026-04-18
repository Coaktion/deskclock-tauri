import { useState, useEffect } from "react";
import { X, DollarSign } from "lucide-react";
import type { Task } from "@domain/entities/Task";
import type { Project } from "@domain/entities/Project";
import type { Category } from "@domain/entities/Category";
import { Autocomplete } from "@presentation/components/Autocomplete";
import { DatePickerInput } from "@presentation/components/DatePickerInput";
import { TaskRepository } from "@infra/database/TaskRepository";
import { updateTask } from "@domain/usecases/tasks/UpdateTask";
import { addDaysISO } from "@shared/utils/time";

const repo = new TaskRepository();

interface EditTaskModalProps {
  task: Task;
  projects: Project[];
  categories: Category[];
  onSave: () => void;
  onClose: () => void;
}

function localDateISO(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function isoToHHMM(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function buildISO(dateISO: string, hhmm: string): string {
  const [h, m] = hhmm.split(":").map(Number);
  const d = new Date(`${dateISO}T00:00:00`);
  d.setHours(h, m, 0, 0);
  return d.toISOString();
}

export function EditTaskModal({ task, projects, categories, onSave, onClose }: EditTaskModalProps) {
  const [name, setName] = useState(task.name ?? "");
  const [projectName, setProjectName] = useState(
    projects.find((p) => p.id === task.projectId)?.name ?? ""
  );
  const [categoryName, setCategoryName] = useState(
    categories.find((c) => c.id === task.categoryId)?.name ?? ""
  );
  const [billable, setBillable] = useState(task.billable);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(task.projectId);
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(task.categoryId);

  // Data de início (local) como referência para construir os ISOs
  const [startDate, setStartDate] = useState(localDateISO(task.startTime));
  const [startTime, setStartTime] = useState(isoToHHMM(task.startTime));
  const [endTime, setEndTime] = useState(() => {
    if (task.endTime) return isoToHHMM(task.endTime);
    // fallback: start + duration
    const endMs = new Date(task.startTime).getTime() + (task.durationSeconds ?? 0) * 1000;
    return isoToHHMM(new Date(endMs).toISOString());
  });

  const [saving, setSaving] = useState(false);

  // ESC fecha o modal
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function handleSave() {
    if (saving) return;
    const pId = projects.find((p) => p.name === projectName)?.id ?? selectedProjectId ?? null;
    const cId = categories.find((c) => c.name === categoryName)?.id ?? selectedCategoryId ?? null;

    const startISO = buildISO(startDate, startTime);
    let endISO = buildISO(startDate, endTime);
    // Se hora fim for anterior à hora início, consideramos que passou da meia-noite
    if (new Date(endISO) < new Date(startISO)) {
      endISO = buildISO(addDaysISO(startDate, 1), endTime);
    }
    const durationSeconds = Math.max(
      0,
      Math.round((new Date(endISO).getTime() - new Date(startISO).getTime()) / 1000)
    );

    setSaving(true);
    await updateTask(
      repo,
      task.id,
      {
        name: name.trim() || null,
        projectId: pId,
        categoryId: cId,
        billable,
        startTime: startISO,
        endTime: endISO,
        durationSeconds,
      },
      new Date().toISOString()
    );
    setSaving(false);
    onSave();
    onClose();
  }

  const enterSave = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.nativeEvent.isComposing) handleSave();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="bg-gray-900 border border-gray-700 rounded-lg w-full max-w-md p-5 shadow-xl">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold text-gray-100">Editar tarefa</h2>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-300">
            <X size={16} />
          </button>
        </div>

        <div className="space-y-3">
          {/* Nome */}
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={enterSave}
            placeholder="Nome (opcional)"
            autoFocus
            className="w-full px-2.5 py-1.5 text-sm bg-gray-800 border border-gray-700 rounded text-gray-100 placeholder-gray-500 focus:outline-none focus:border-blue-500"
          />

          {/* Projeto e categoria */}
          <div className="grid grid-cols-2 gap-2">
            <Autocomplete
              value={projectName}
              onChange={setProjectName}
              onSelect={(o) => setSelectedProjectId(o.id)}
              onEnter={handleSave}
              options={projects}
              placeholder="Projeto"
            />
            <Autocomplete
              value={categoryName}
              onChange={(v) => {
                setCategoryName(v);
                const cat = categories.find((c) => c.name === v);
                if (cat) setBillable(cat.defaultBillable);
              }}
              onSelect={(o) => {
                setSelectedCategoryId(o.id);
                const cat = categories.find((c) => c.id === o.id);
                if (cat) setBillable(cat.defaultBillable);
              }}
              onEnter={handleSave}
              options={categories}
              placeholder="Categoria"
            />
          </div>

          {/* Billable */}
          <button
            type="button"
            onClick={() => setBillable((b) => !b)}
            title={billable ? "Billable — clique para alternar" : "Non-billable — clique para alternar"}
            className={`flex items-center gap-1.5 px-3 py-2 text-sm rounded-lg border transition-colors ${
              billable
                ? "bg-green-900/40 border-green-700 text-green-400"
                : "bg-gray-800 border-gray-700 text-gray-400 hover:text-gray-300"
            }`}
          >
            <DollarSign size={14} />
            {billable ? "Billable" : "Non-billable"}
          </button>

          {/* Data */}
          <DatePickerInput value={startDate} onChange={setStartDate} className="w-full" />

          {/* Hora início e hora fim na mesma linha */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-500 shrink-0">Início</span>
            <input
              type="time"
              value={startTime}
              onChange={(e) => setStartTime(e.target.value)}
              onKeyDown={enterSave}
              className="w-24 px-2 py-1.5 text-sm bg-gray-800 border border-gray-700 rounded text-gray-100 focus:outline-none focus:border-blue-500"
            />
            <span className="text-xs text-gray-500 shrink-0">Fim</span>
            <input
              type="time"
              value={endTime}
              onChange={(e) => setEndTime(e.target.value)}
              onKeyDown={enterSave}
              className="w-24 px-2 py-1.5 text-sm bg-gray-800 border border-gray-700 rounded text-gray-100 focus:outline-none focus:border-blue-500"
            />
          </div>
        </div>

        <div className="flex justify-end gap-2 mt-5">
          <button
            onClick={onClose}
            className="px-3 py-1.5 text-sm text-gray-400 hover:text-gray-200"
          >
            Cancelar
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-3 py-1.5 text-sm bg-blue-600 hover:bg-blue-500 text-white rounded disabled:opacity-50"
          >
            Salvar
          </button>
        </div>
      </div>
    </div>
  );
}
