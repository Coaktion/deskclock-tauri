import { useState } from "react";
import { X } from "lucide-react";
import type { Task } from "@domain/entities/Task";
import type { Project } from "@domain/entities/Project";
import type { Category } from "@domain/entities/Category";
import { Autocomplete } from "@presentation/components/Autocomplete";
import { DatePickerInput } from "@presentation/components/DatePickerInput";
import { TaskRepository } from "@infra/database/TaskRepository";
import { updateTask } from "@domain/usecases/tasks/UpdateTask";
import { formatHHMMSS, parseDurationInput } from "@shared/utils/time";

const repo = new TaskRepository();

interface EditTaskModalProps {
  task: Task;
  projects: Project[];
  categories: Category[];
  onSave: () => void;
  onClose: () => void;
}

function isoToDate(iso: string): string {
  return iso.slice(0, 10);
}

function isoToTime(iso: string): string {
  // Converte UTC para local HH:MM
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function buildStartISO(dateISO: string, timeHHMM: string): string {
  const [h, m] = timeHHMM.split(":").map(Number);
  const d = new Date(`${dateISO}T00:00:00`);
  d.setHours(h, m, 0, 0);
  return d.toISOString();
}

export function EditTaskModal({ task, projects, categories, onSave, onClose }: EditTaskModalProps) {
  const [name, setName] = useState(task.name ?? "");
  const [projectName, setProjectName] = useState(projects.find((p) => p.id === task.projectId)?.name ?? "");
  const [categoryName, setCategoryName] = useState(categories.find((c) => c.id === task.categoryId)?.name ?? "");
  const [billable, setBillable] = useState(task.billable);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(task.projectId);
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(task.categoryId);

  // Data e hora
  const [startDate, setStartDate] = useState(isoToDate(task.startTime));
  const [startTime, setStartTime] = useState(isoToTime(task.startTime));
  const [durationInput, setDurationInput] = useState(
    formatHHMMSS(task.durationSeconds ?? 0)
  );

  const [saving, setSaving] = useState(false);
  const [durationError, setDurationError] = useState(false);

  function handleDurationChange(v: string) {
    setDurationInput(v);
    setDurationError(false);
  }

  async function handleSave() {
    const durationSeconds = parseDurationInput(durationInput);
    if (durationSeconds === null) {
      setDurationError(true);
      return;
    }

    const pId = projects.find((p) => p.name === projectName)?.id ?? selectedProjectId ?? null;
    const cId = categories.find((c) => c.name === categoryName)?.id ?? selectedCategoryId ?? null;
    const newStartISO = buildStartISO(startDate, startTime);
    const newEndISO = new Date(new Date(newStartISO).getTime() + durationSeconds * 1000).toISOString();

    setSaving(true);
    await updateTask(repo, task.id, {
      name: name.trim() || null,
      projectId: pId,
      categoryId: cId,
      billable,
      startTime: newStartISO,
      endTime: newEndISO,
      durationSeconds,
    }, new Date().toISOString());
    setSaving(false);
    onSave();
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="bg-gray-900 border border-gray-700 rounded-lg w-full max-w-sm p-5 shadow-xl">
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
            placeholder="Nome (opcional)"
            className="w-full px-2.5 py-1.5 text-sm bg-gray-800 border border-gray-700 rounded text-gray-100 placeholder-gray-500 focus:outline-none focus:border-blue-500"
          />

          {/* Projeto e categoria */}
          <Autocomplete
            value={projectName}
            onChange={setProjectName}
            onSelect={(o) => setSelectedProjectId(o.id)}
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
            options={categories}
            placeholder="Categoria"
          />

          {/* Billable */}
          <label className="flex items-center gap-2 text-sm text-gray-300 cursor-pointer">
            <input
              type="checkbox"
              checked={billable}
              onChange={(e) => setBillable(e.target.checked)}
              className="accent-blue-500"
            />
            Billable
          </label>

          {/* Data e hora de início */}
          <div className="flex gap-2">
            <DatePickerInput
              value={startDate}
              onChange={setStartDate}
              className="flex-1"
            />
            <input
              type="time"
              value={startTime}
              onChange={(e) => setStartTime(e.target.value)}
              className="w-24 px-2.5 py-1.5 text-sm bg-gray-800 border border-gray-700 rounded text-gray-100 focus:outline-none focus:border-blue-500"
            />
          </div>

          {/* Duração */}
          <div>
            <input
              type="text"
              value={durationInput}
              onChange={(e) => handleDurationChange(e.target.value)}
              placeholder="Duração: HH:MM:SS ou MM:SS ou minutos"
              className={`w-full px-2.5 py-1.5 text-sm bg-gray-800 border rounded text-gray-100 placeholder-gray-500 focus:outline-none focus:border-blue-500 ${
                durationError ? "border-red-500" : "border-gray-700"
              }`}
            />
            {durationError && (
              <p className="text-xs text-red-400 mt-1">
                Formato inválido. Use HH:MM:SS, MM:SS ou número de minutos.
              </p>
            )}
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
