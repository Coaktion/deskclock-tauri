import { useState, useEffect, useCallback, useRef } from "react";
import { ChevronLeft, ChevronRight, Trash2, Pencil, DollarSign } from "lucide-react";
import { Autocomplete } from "@presentation/components/Autocomplete";
import { DatePickerInput } from "@presentation/components/DatePickerInput";
import { EditTaskModal } from "@presentation/modals/EditTaskModal";
import { useProjects } from "@presentation/hooks/useProjects";
import { useCategories } from "@presentation/hooks/useCategories";
import { TaskRepository } from "@infra/database/TaskRepository";
import { createRetroactiveTask } from "@domain/usecases/tasks/CreateRetroactiveTask";
import { deleteTask } from "@domain/usecases/tasks/DeleteTask";
import type { Task } from "@domain/entities/Task";
import type { Project } from "@domain/entities/Project";
import type { Category } from "@domain/entities/Category";
import { todayISO, addDaysISO, parseDurationInput, formatHHMMSS } from "@shared/utils/time";

const repo = new TaskRepository();

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

function nowHHMM(): string {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

/** Constrói ISO UTC a partir de data local (YYYY-MM-DD) e hora local (HH:MM) */
function buildISO(dateISO: string, hhmm: string): string {
  const [h, m] = hhmm.split(":").map(Number);
  const d = new Date(dateISO + "T00:00:00"); // local midnight
  d.setHours(h, m, 0, 0);
  return d.toISOString();
}

function isoToHHMM(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function formatTimeRange(startISO: string, endISO: string | null): string {
  const s = isoToHHMM(startISO);
  if (!endISO) return s;
  const e = isoToHHMM(endISO);
  return `${s} – ${e}`;
}

/** Calcula duração em HH:MM entre dois horários; trata overnight automaticamente */
function computeDurationHHMM(start: string, end: string): string {
  const [sh, sm] = start.split(":").map(Number);
  const [eh, em] = end.split(":").map(Number);
  let diff = (eh * 60 + em) - (sh * 60 + sm);
  if (diff <= 0) diff += 1440;
  const h = Math.floor(diff / 60);
  const m = diff % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/** Calcula hora fim HH:MM a partir de hora início e duração em segundos */
function computeEndHHMM(start: string, durationSeconds: number): string {
  const [sh, sm] = start.split(":").map(Number);
  const totalMins = sh * 60 + sm + Math.round(durationSeconds / 60);
  const endMins = ((totalMins % 1440) + 1440) % 1440;
  return `${String(Math.floor(endMins / 60)).padStart(2, "0")}:${String(endMins % 60).padStart(2, "0")}`;
}

interface TaskRowProps {
  task: Task;
  projects: Project[];
  categories: Category[];
  onEdit: (task: Task) => void;
  onDelete: (id: string) => void;
}

function TaskRow({ task, projects, categories, onEdit, onDelete }: TaskRowProps) {
  const projectName = projects.find((p) => p.id === task.projectId)?.name;
  const categoryName = categories.find((c) => c.id === task.categoryId)?.name;

  return (
    <div className="flex items-center gap-3 px-5 py-3 border-b border-gray-800 hover:bg-gray-900/50">
      <DollarSign
        size={13}
        className={`shrink-0 ${task.billable ? "text-green-400" : "text-gray-500"}`}
      />
      <span className="text-xs text-gray-500 shrink-0 font-mono w-28">
        {formatTimeRange(task.startTime, task.endTime)}
      </span>
      <span className="flex-1 text-sm text-gray-200 truncate">
        {task.name ?? <span className="text-gray-500 italic">(sem nome)</span>}
      </span>
      {projectName && (
        <span className="text-xs text-gray-500 truncate max-w-24">{projectName}</span>
      )}
      {categoryName && (
        <span className="text-xs text-gray-500 truncate max-w-24">{categoryName}</span>
      )}
      <span className="text-xs text-gray-500 font-mono shrink-0">
        {formatHHMMSS(task.durationSeconds ?? 0)}
      </span>
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
    </div>
  );
}

const DEFAULT_DURATION_SECS = 3600; // 1h para novas tarefas encadeadas

export function RetroactivePage() {
  const today = todayISO();
  const { projects } = useProjects();
  const { categories } = useCategories();

  const [selectedDate, setSelectedDate] = useState(today);
  const [tasks, setTasks] = useState<Task[]>([]);

  // Form
  const [name, setName] = useState("");
  const [projectName, setProjectName] = useState("");
  const [categoryName, setCategoryName] = useState("");
  const [billable, setBillable] = useState(true);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null);
  const [startTime, setStartTime] = useState(nowHHMM);
  const [endTime, setEndTime] = useState(() => computeEndHHMM(nowHHMM(), DEFAULT_DURATION_SECS));
  const [durationInput, setDurationInput] = useState("01:00");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);

  const nameRef = useRef<HTMLInputElement>(null);

  const loadTasks = useCallback(async () => {
    const startBound = new Date(selectedDate + "T00:00:00").toISOString();
    const endBound = new Date(selectedDate + "T23:59:59.999").toISOString();
    const all = await repo.findByDateRange(startBound, endBound);
    const completed = all.filter((t) => t.status === "completed");
    setTasks([...completed].sort((a, b) => b.startTime.localeCompare(a.startTime)));
  }, [selectedDate]);

  useEffect(() => {
    loadTasks();
  }, [loadTasks]);

  function handleStartChange(val: string) {
    setStartTime(val);
    setDurationInput(computeDurationHHMM(val, endTime));
    setError("");
  }

  function handleEndChange(val: string) {
    setEndTime(val);
    setDurationInput(computeDurationHHMM(startTime, val));
    setError("");
  }

  function handleDurationBlur() {
    const parsed = parseDurationInput(durationInput);
    if (parsed && parsed > 0) {
      const newEnd = computeEndHHMM(startTime, parsed);
      setEndTime(newEnd);
      // Normaliza o campo para HH:MM
      const h = Math.floor(parsed / 3600);
      const m = Math.floor((parsed % 3600) / 60);
      setDurationInput(`${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`);
    }
  }

  async function handleAdd() {
    setError("");
    const startISO = buildISO(selectedDate, startTime);
    let endISO = buildISO(selectedDate, endTime);
    // Overnight: hora fim anterior à hora início
    if (new Date(endISO) <= new Date(startISO)) {
      endISO = buildISO(addDaysISO(selectedDate, 1), endTime);
    }
    const durationSeconds = Math.round(
      (new Date(endISO).getTime() - new Date(startISO).getTime()) / 1000
    );

    if (durationSeconds <= 0) {
      setError("A duração deve ser maior que zero.");
      return;
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

    // Encadeia: próximo início = fim anterior, mantém duração anterior
    const nextStart = isoToHHMM(endISO);
    const nextEnd = computeEndHHMM(nextStart, durationSeconds);
    const h = Math.floor(durationSeconds / 3600);
    const m = Math.floor((durationSeconds % 3600) / 60);
    setName("");
    setStartTime(nextStart);
    setEndTime(nextEnd);
    setDurationInput(`${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`);
    nameRef.current?.focus();
    await loadTasks();
  }

  async function handleDelete(id: string) {
    await deleteTask(repo, id);
    await loadTasks();
  }

  const totalSeconds = tasks.reduce((acc, t) => acc + (t.durationSeconds ?? 0), 0);

  return (
    <div className="h-full flex flex-col">
      {/* Header com navegação de data */}
      <div className="px-5 py-3 border-b border-gray-800 flex items-center gap-3">
        <button
          onClick={() => setSelectedDate(addDaysISO(selectedDate, -1))}
          className="text-gray-500 hover:text-gray-200 p-1 rounded hover:bg-gray-800 transition-colors"
        >
          <ChevronLeft size={16} />
        </button>
        <DatePickerInput
          value={selectedDate}
          onChange={setSelectedDate}
          className="text-sm font-medium text-gray-200"
        />
        <button
          onClick={() => setSelectedDate(addDaysISO(selectedDate, 1))}
          disabled={selectedDate >= today}
          className="text-gray-500 hover:text-gray-200 p-1 rounded hover:bg-gray-800 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
        >
          <ChevronRight size={16} />
        </button>
        <span className="flex-1 text-sm text-gray-400">{formatDateHeader(selectedDate)}</span>
        {totalSeconds > 0 && (
          <span className="text-xs text-gray-500 font-mono">
            {formatHHMMSS(totalSeconds)} total
          </span>
        )}
      </div>

      {/* Formulário inline */}
      <div className="px-5 py-4 border-b border-gray-800 space-y-3">
        {/* Nome */}
        <input
          ref={nameRef}
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.nativeEvent.isComposing) void handleAdd();
          }}
          placeholder="Nome da tarefa (opcional)"
          className="w-full px-2.5 py-1.5 text-sm bg-gray-800 border border-gray-700 rounded text-gray-100 placeholder-gray-500 focus:outline-none focus:border-blue-500"
        />

        {/* Projeto, Categoria, Billable */}
        <div className="flex gap-2 items-center">
          <Autocomplete
            value={projectName}
            onChange={setProjectName}
            onSelect={(o) => setSelectedProjectId(o.id)}
            onEnter={handleAdd}
            options={projects}
            placeholder="Projeto"
            className="flex-1"
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
            onEnter={handleAdd}
            options={categories}
            placeholder="Categoria"
            className="flex-1"
          />
          <button
            type="button"
            onClick={() => setBillable((b) => !b)}
            title={billable ? "Billable — clique para alternar" : "Non-billable — clique para alternar"}
            className={`flex items-center gap-1 shrink-0 transition-colors ${
              billable ? "text-green-400" : "text-gray-500 hover:text-gray-400"
            }`}
          >
            <DollarSign size={14} />
          </button>
        </div>

        {/* Início, Fim, Duração */}
        <div className="flex gap-2 items-center">
          <span className="text-xs text-gray-500 shrink-0">Início</span>
          <input
            type="time"
            value={startTime}
            onChange={(e) => handleStartChange(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") void handleAdd(); }}
            className="w-28 px-2 py-1.5 text-sm bg-gray-800 border border-gray-700 rounded text-gray-100 focus:outline-none focus:border-blue-500"
          />
          <span className="text-xs text-gray-600 shrink-0">→</span>
          <span className="text-xs text-gray-500 shrink-0">Fim</span>
          <input
            type="time"
            value={endTime}
            onChange={(e) => handleEndChange(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") void handleAdd(); }}
            className="w-28 px-2 py-1.5 text-sm bg-gray-800 border border-gray-700 rounded text-gray-100 focus:outline-none focus:border-blue-500"
          />
          <input
            type="text"
            value={durationInput}
            onChange={(e) => setDurationInput(e.target.value)}
            onBlur={handleDurationBlur}
            onKeyDown={(e) => {
              if (e.key === "Enter") { handleDurationBlur(); void handleAdd(); }
            }}
            placeholder="HH:MM"
            title="Duração — edite para ajustar hora fim"
            className="w-20 px-2 py-1.5 text-sm bg-gray-800 border border-gray-700 rounded text-gray-400 placeholder-gray-600 focus:outline-none focus:border-blue-500 focus:text-gray-100"
          />
          <button
            onClick={() => void handleAdd()}
            disabled={saving}
            className="ml-auto px-4 py-1.5 text-sm bg-blue-600 hover:bg-blue-500 text-white rounded transition-colors disabled:opacity-50"
          >
            Adicionar
          </button>
        </div>

        {error && <p className="text-xs text-red-400">{error}</p>}
      </div>

      {/* Lista de tarefas */}
      <div className="flex-1 overflow-y-auto pr-2">
        {tasks.length === 0 ? (
          <p className="text-center text-gray-600 text-sm py-10">Nenhuma entrada para este dia</p>
        ) : (
          tasks.map((t) => (
            <TaskRow
              key={t.id}
              task={t}
              projects={projects}
              categories={categories}
              onEdit={setEditingTask}
              onDelete={handleDelete}
            />
          ))
        )}
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
