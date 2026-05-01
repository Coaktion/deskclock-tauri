import { useState } from "react";
import { X, DollarSign } from "lucide-react";
import type { Project } from "@domain/entities/Project";
import type { Category } from "@domain/entities/Category";
import { Autocomplete } from "@presentation/components/Autocomplete";
import { DatePickerInput } from "@presentation/components/DatePickerInput";
import { TaskRepository } from "@infra/database/TaskRepository";
import { createRetroactiveTask } from "@domain/usecases/tasks/CreateRetroactiveTask";
import { todayISO, parseDurationInput, addDaysISO } from "@shared/utils/time";

const repo = new TaskRepository();

type DurationMode = "endtime" | "duration";

interface RetroactiveTaskModalProps {
  projects: Project[];
  categories: Category[];
  onSave: () => void;
  onClose: () => void;
}

function nowHHMM(): string {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function buildISO(dateISO: string, hhmm: string): string {
  const [h, m] = hhmm.split(":").map(Number);
  const d = new Date(`${dateISO}T00:00:00`);
  d.setHours(h, m, 0, 0);
  return d.toISOString();
}

export function RetroactiveTaskModal({
  projects,
  categories,
  onSave,
  onClose,
}: RetroactiveTaskModalProps) {
  const [name, setName] = useState("");
  const [projectName, setProjectName] = useState("");
  const [categoryName, setCategoryName] = useState("");
  const [billable, setBillable] = useState(true);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null);

  const [startDate, setStartDate] = useState(todayISO());
  const [startTime, setStartTime] = useState(nowHHMM());
  const [mode, setMode] = useState<DurationMode>("endtime");
  const [endTime, setEndTime] = useState(nowHHMM());
  const [durationInput, setDurationInput] = useState("01:00");

  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    setError("");
    const startISO = buildISO(startDate, startTime);
    let endISO: string;
    let durationSeconds: number;

    if (mode === "endtime") {
      endISO = buildISO(startDate, endTime);
      // Se hora fim <= hora início, assume dia seguinte
      if (new Date(endISO) <= new Date(startISO)) {
        endISO = buildISO(addDaysISO(startDate, 1), endTime);
      }
      durationSeconds = Math.round(
        (new Date(endISO).getTime() - new Date(startISO).getTime()) / 1000
      );
      if (durationSeconds <= 0) {
        setError("Hora de fim deve ser depois da hora de início.");
        return;
      }
    } else {
      const parsed = parseDurationInput(durationInput);
      if (parsed === null || parsed <= 0) {
        setError("Formato inválido. Use HH:MM:SS, MM:SS ou número de minutos.");
        return;
      }
      durationSeconds = parsed;
      endISO = new Date(new Date(startISO).getTime() + durationSeconds * 1000).toISOString();
    }

    const pId = projects.find((p) => p.name === projectName)?.id ?? selectedProjectId ?? null;
    const cId = categories.find((c) => c.name === categoryName)?.id ?? selectedCategoryId ?? null;

    setSaving(true);
    await createRetroactiveTask(
      repo,
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

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-950/80">
      <div className="bg-gray-900 border border-gray-800 rounded-xl w-full max-w-md p-5 shadow-xl">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold text-gray-100">Lançamento manual</h2>
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
            className="w-full px-2.5 py-1.5 text-sm bg-gray-800 border border-gray-700 rounded-lg text-gray-100 placeholder-gray-500 focus:outline-none focus:border-blue-500"
          />

          {/* Projeto e Categoria */}
          <div className="grid grid-cols-2 gap-2">
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
          </div>

          {/* Billable */}
          <button
            type="button"
            onClick={() => setBillable((b) => !b)}
            title={
              billable ? "Billable — clique para alternar" : "Non-billable — clique para alternar"
            }
            className={`flex items-center gap-1.5 px-3 py-2 text-sm rounded-lg border transition-colors ${
              billable
                ? "bg-green-900/40 border-green-700 text-green-400"
                : "bg-gray-800 border-gray-700 text-gray-400 hover:text-gray-300"
            }`}
          >
            <DollarSign size={14} />
            {billable ? "Billable" : "Non-billable"}
          </button>

          {/* Data e hora de início */}
          <div>
            <p className="text-xs text-gray-500 mb-1">Início</p>
            <div className="flex gap-2">
              <DatePickerInput value={startDate} onChange={setStartDate} className="flex-1" />
              <input
                type="time"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
                className="w-24 px-2.5 py-1.5 text-sm bg-gray-800 border border-gray-700 rounded-lg text-gray-100 focus:outline-none focus:border-blue-500"
              />
            </div>
          </div>

          {/* Toggle modo duração */}
          <div>
            <div className="flex gap-1 mb-2">
              <button
                onClick={() => setMode("endtime")}
                className={`px-3 py-1 text-xs rounded-lg transition-colors ${
                  mode === "endtime"
                    ? "bg-blue-600 text-white"
                    : "bg-gray-800 text-gray-400 hover:text-gray-200"
                }`}
              >
                Hora fim
              </button>
              <button
                onClick={() => setMode("duration")}
                className={`px-3 py-1 text-xs rounded-lg transition-colors ${
                  mode === "duration"
                    ? "bg-blue-600 text-white"
                    : "bg-gray-800 text-gray-400 hover:text-gray-200"
                }`}
              >
                Duração
              </button>
            </div>

            {mode === "endtime" ? (
              <input
                type="time"
                value={endTime}
                onChange={(e) => {
                  setEndTime(e.target.value);
                  setError("");
                }}
                className="w-24 px-2.5 py-1.5 text-sm bg-gray-800 border border-gray-700 rounded-lg text-gray-100 focus:outline-none focus:border-blue-500"
              />
            ) : (
              <input
                type="text"
                value={durationInput}
                onChange={(e) => {
                  setDurationInput(e.target.value);
                  setError("");
                }}
                placeholder="HH:MM:SS, MM:SS ou minutos"
                className="w-full px-2.5 py-1.5 text-sm bg-gray-800 border border-gray-700 rounded-lg text-gray-100 placeholder-gray-500 focus:outline-none focus:border-blue-500"
              />
            )}
          </div>

          {error && <p className="text-xs text-red-400">{error}</p>}
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
            className="px-3 py-1.5 text-sm bg-blue-600 hover:bg-blue-500 text-white rounded-lg disabled:opacity-50"
          >
            Salvar
          </button>
        </div>
      </div>
    </div>
  );
}
