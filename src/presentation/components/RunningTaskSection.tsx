import { useEffect, useState } from "react";
import { Play, Pause, Square, Pencil, X, CheckCircle2, Clock, ArrowRight } from "lucide-react";
import { listen } from "@tauri-apps/api/event";
import type { Project } from "@domain/entities/Project";
import type { Category } from "@domain/entities/Category";
import { useRunningTask } from "@presentation/contexts/RunningTaskContext";
import { useTaskTimer } from "@presentation/hooks/useTaskTimer";
import { RunningTaskEditForm } from "./RunningTaskEditForm";
import { Autocomplete } from "./Autocomplete";
import { OVERLAY_EVENTS } from "@shared/types/overlayEvents";
import { formatHHMMSS, formatTimeOfDay } from "@shared/utils/time";

interface RunningTaskSectionProps {
  projects: Project[];
  categories: Category[];
}

export function RunningTaskSection({ projects, categories }: RunningTaskSectionProps) {
  const { runningTask, pauseTask, resumeTask, stopTask, cancelTask, updateActiveTask } =
    useRunningTask();
  const seconds = useTaskTimer(runningTask);
  const [editing, setEditing] = useState(false);
  const [editFocusField, setEditFocusField] = useState<"name" | "project" | "category" | undefined>();
  const [confirmingStop, setConfirmingStop] = useState(false);
  const [fillingRequired, setFillingRequired] = useState(false);
  const [fillName, setFillName] = useState("");
  const [fillProjectName, setFillProjectName] = useState("");
  const [fillProjectId, setFillProjectId] = useState<string | null>(null);
  const [editingStartTime, setEditingStartTime] = useState(false);
  const [startTimeInput, setStartTimeInput] = useState("");

  // Abre edição com foco no primeiro campo vazio ao receber evento do overlay
  useEffect(() => {
    const unlisten = listen(OVERLAY_EVENTS.OVERLAY_FOCUS_TASK_EDIT, () => {
      if (!runningTask) return;
      const focusField = !runningTask.name?.trim()
        ? "name"
        : !runningTask.projectId
          ? "project"
          : !runningTask.categoryId
            ? "category"
            : undefined;
      setEditFocusField(focusField);
      setEditing(true);
    });
    return () => { unlisten.then((fn) => fn()); };
  }, [runningTask]);

  if (!runningTask) return null;

  const isRunning = runningTask.status === "running";
  const displayName = runningTask.name ?? "(sem nome)";
  const project = projects.find((p) => p.id === runningTask.projectId);
  const category = categories.find((c) => c.id === runningTask.categoryId);

  async function handlePlayPause() {
    if (isRunning) await pauseTask();
    else await resumeTask();
  }

  function handleStopClick() {
    const missingName = !runningTask.name?.trim();
    const missingProject = !runningTask.projectId;
    if (missingName || missingProject) {
      setFillName(runningTask.name ?? "");
      setFillProjectName(projects.find((p) => p.id === runningTask.projectId)?.name ?? "");
      setFillProjectId(runningTask.projectId);
      setFillingRequired(true);
    } else {
      setConfirmingStop(true);
    }
  }

  async function handleFillSubmit() {
    const pId = projects.find((p) => p.name === fillProjectName)?.id ?? fillProjectId ?? null;
    await updateActiveTask({ name: fillName.trim() || null, projectId: pId });
    setFillingRequired(false);
    setConfirmingStop(true);
  }

  async function handleStopConfirm(completed: boolean) {
    setConfirmingStop(false);
    setEditing(false);
    await stopTask(completed);
  }

  async function handleSaveEdit(data: {
    name: string | null;
    projectId: string | null;
    categoryId: string | null;
    billable: boolean;
  }) {
    await updateActiveTask(data);
    setEditing(false);
    setEditFocusField(undefined);
  }

  function handleStartTimeClick() {
    const d = new Date(runningTask.startTime);
    const hh = String(d.getHours()).padStart(2, "0");
    const mm = String(d.getMinutes()).padStart(2, "0");
    setStartTimeInput(`${hh}:${mm}`);
    setEditingStartTime(true);
  }

  async function handleStartTimeCommit() {
    setEditingStartTime(false);
    const [hh, mm] = startTimeInput.split(":").map(Number);
    if (isNaN(hh) || isNaN(mm)) return;
    // Constrói o novo startTime no dia atual (lógica de fuso local)
    const base = new Date(runningTask.startTime);
    base.setHours(hh, mm, 0, 0);
    // Não permite hora de início no futuro
    if (base > new Date()) return;
    await updateActiveTask({ startTime: base.toISOString() });
  }

  return (
    <section className="bg-gray-900 border border-gray-700 rounded-lg p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span
              className={`w-2 h-2 rounded-full flex-shrink-0 ${
                runningTask.billable ? "bg-blue-400" : "bg-gray-500"
              }`}
            />
            <span className="text-sm font-medium text-gray-100 truncate">{displayName}</span>
          </div>
          <div className="flex gap-3 mt-1 text-xs text-gray-500 items-center">
            {project && <span>{project.name}</span>}
            {category && <span>{category.name}</span>}
            {editingStartTime ? (
              <input
                type="time"
                value={startTimeInput}
                onChange={(e) => setStartTimeInput(e.target.value)}
                onBlur={handleStartTimeCommit}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleStartTimeCommit();
                  if (e.key === "Escape") setEditingStartTime(false);
                }}
                autoFocus
                className="bg-gray-800 border border-gray-600 rounded px-1 text-gray-200 text-xs focus:outline-none focus:border-blue-500"
              />
            ) : (
              <button
                onClick={handleStartTimeClick}
                title="Editar hora de início"
                className="hover:text-gray-300 transition-colors"
              >
                início {formatTimeOfDay(runningTask.startTime)}
              </button>
            )}
          </div>
        </div>

        <div className="flex items-center gap-1 flex-shrink-0">
          <span className="text-lg font-mono text-gray-100 mr-2">{formatHHMMSS(seconds)}</span>
          {confirmingStop ? (
            <div className="flex items-center gap-1">
              <span className="text-xs text-gray-500 mr-1">Concluída?</span>
              <button
                onClick={() => handleStopConfirm(true)}
                title="Concluída"
                className="flex items-center gap-1 px-2 py-1 text-xs bg-green-700 hover:bg-green-600 text-white rounded transition-colors"
              >
                <CheckCircle2 size={12} />
                Sim
              </button>
              <button
                onClick={() => handleStopConfirm(false)}
                title="Pendente"
                className="flex items-center gap-1 px-2 py-1 text-xs bg-gray-700 hover:bg-gray-600 text-gray-200 rounded transition-colors"
              >
                <Clock size={12} />
                Não
              </button>
              <button
                onClick={() => setConfirmingStop(false)}
                className="p-1 text-gray-600 hover:text-gray-400 rounded"
              >
                <X size={13} />
              </button>
            </div>
          ) : (
            <>
              <button
                onClick={handlePlayPause}
                title={isRunning ? "Pausar" : "Retomar"}
                className="p-1.5 text-gray-400 hover:text-gray-100 rounded hover:bg-gray-800"
              >
                {isRunning ? <Pause size={16} /> : <Play size={16} />}
              </button>
              <button
                onClick={handleStopClick}
                title="Parar"
                className="p-1.5 text-gray-400 hover:text-red-400 rounded hover:bg-gray-800"
              >
                <Square size={16} />
              </button>
              <button
                onClick={() => setEditing((v) => !v)}
                title="Editar"
                className={`p-1.5 rounded hover:bg-gray-800 ${editing ? "text-blue-400" : "text-gray-400 hover:text-gray-100"}`}
              >
                <Pencil size={16} />
              </button>
              <button
                onClick={() => cancelTask()}
                title="Cancelar tarefa"
                className="p-1.5 text-gray-400 hover:text-red-400 rounded hover:bg-gray-800"
              >
                <X size={16} />
              </button>
            </>
          )}
        </div>
      </div>

      {fillingRequired && (
        <div className="mt-3 pt-3 border-t border-gray-700 space-y-2">
          <p className="text-xs text-yellow-400">Preencha antes de concluir:</p>
          <input
            type="text"
            value={fillName}
            onChange={(e) => setFillName(e.target.value)}
            placeholder="Nome da tarefa"
            autoFocus
            className="w-full px-2.5 py-1.5 text-sm bg-gray-800 border border-gray-700 rounded text-gray-100 placeholder-gray-500 focus:outline-none focus:border-blue-500"
          />
          <Autocomplete
            value={fillProjectName}
            onChange={setFillProjectName}
            onSelect={(o) => setFillProjectId(o.id)}
            onEnter={handleFillSubmit}
            options={projects}
            placeholder="Projeto"
          />
          <div className="flex gap-2 justify-end">
            <button
              onClick={() => setFillingRequired(false)}
              className="px-3 py-1.5 text-xs text-gray-400 hover:text-gray-200 transition-colors"
            >
              Cancelar
            </button>
            <button
              onClick={handleFillSubmit}
              className="flex items-center gap-1 px-3 py-1.5 text-xs bg-blue-600 hover:bg-blue-500 text-white rounded transition-colors"
            >
              <ArrowRight size={12} />
              Continuar
            </button>
          </div>
        </div>
      )}

      {editing && (
        <RunningTaskEditForm
          task={runningTask}
          projects={projects}
          categories={categories}
          focusField={editFocusField}
          onSave={handleSaveEdit}
          onCancel={() => { setEditing(false); setEditFocusField(undefined); }}
        />
      )}
    </section>
  );
}
