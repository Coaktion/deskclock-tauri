import { useEffect, useRef, useState } from "react";
import {
  ArrowRight,
  CheckCircle2,
  Clock,
  Pause,
  Pen,
  Pencil,
  Play,
  Square,
  X,
} from "lucide-react";
import type { Category } from "@domain/entities/Category";
import type { PlannedTask } from "@domain/entities/PlannedTask";
import type { Project } from "@domain/entities/Project";
import type { Task } from "@domain/entities/Task";
import { useRunningTask } from "@presentation/contexts/RunningTaskContext";
import { useTaskTimer } from "@presentation/hooks/useTaskTimer";
import { Autocomplete } from "./Autocomplete";
import { RunningTaskEditForm } from "./RunningTaskEditForm";
import { formatHHMMSS, formatTimeOfDay } from "@shared/utils/time";

// ─── Types ────────────────────────────────────────────────────────────────────

interface OmniboxProps {
  plannedTasks: PlannedTask[];
  recentTasks: Task[];
  projects: Project[];
  categories: Category[];
  onStarted?: () => void;
  focusTaskEdit?: boolean;
  onFocusTaskEditHandled?: () => void;
}

interface DraftState {
  name: string;
  projectName: string;
  projectId: string | null;
  categoryName: string;
  categoryId: string | null;
  billable: boolean;
}

// ─── Chip ─────────────────────────────────────────────────────────────────────

interface ChipProps {
  label: string;
  filled: boolean;
  billable?: boolean;
  isBillableChip?: boolean;
  onClick: () => void;
}

function Chip({ label, filled, billable, isBillableChip, onClick }: ChipProps) {
  if (isBillableChip) {
    return (
      <button
        type="button"
        onClick={onClick}
        className={`px-2 py-0.5 rounded text-xs border transition-colors cursor-pointer ${
          billable
            ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/20"
            : "bg-gray-800/60 border-gray-700/50 text-gray-500 hover:border-gray-600 hover:text-gray-400"
        }`}
      >
        {label}
      </button>
    );
  }

  if (filled) {
    return (
      <button
        type="button"
        onClick={onClick}
        className="bg-gray-800 border border-gray-700 rounded px-2 py-0.5 text-xs text-gray-300 cursor-pointer hover:bg-gray-700 transition-colors"
      >
        {label}
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={onClick}
      className="border border-dashed border-gray-600 rounded px-2 py-0.5 text-xs text-gray-500 cursor-pointer hover:border-gray-500 hover:text-gray-400 transition-colors"
    >
      {label}
    </button>
  );
}

// ─── Suggestion item ─────────────────────────────────────────────────────────

interface SuggestionItem {
  key: string;
  name: string;
  projectName?: string;
  billable: boolean;
  projectId: string | null;
  categoryId: string | null;
  categoryName?: string;
  isPlanned: boolean;
}

function buildSuggestions(
  plannedTasks: PlannedTask[],
  recentTasks: Task[],
  projects: Project[],
  categories: Category[],
  query: string
): SuggestionItem[] {
  const q = query.toLowerCase().trim();

  const planned: SuggestionItem[] = plannedTasks.map((t) => ({
    key: `planned-${t.id}`,
    name: t.name,
    projectName: projects.find((p) => p.id === t.projectId)?.name,
    billable: t.billable,
    projectId: t.projectId,
    categoryId: t.categoryId,
    categoryName: categories.find((c) => c.id === t.categoryId)?.name,
    isPlanned: true,
  }));

  const seen = new Set<string>();
  const recent: SuggestionItem[] = [];
  for (const t of recentTasks) {
    const key = `${t.name ?? ""}|${t.projectId ?? ""}`;
    if (!seen.has(key)) {
      seen.add(key);
      recent.push({
        key: `recent-${t.id}`,
        name: t.name ?? "(sem nome)",
        projectName: projects.find((p) => p.id === t.projectId)?.name,
        billable: t.billable,
        projectId: t.projectId,
        categoryId: t.categoryId,
        categoryName: categories.find((c) => c.id === t.categoryId)?.name,
        isPlanned: false,
      });
    }
  }

  const all = [...planned, ...recent];
  if (!q) return all.slice(0, 8);
  return all
    .filter(
      (s) =>
        s.name.toLowerCase().includes(q) ||
        (s.projectName?.toLowerCase().includes(q) ?? false)
    )
    .slice(0, 8);
}

// ─── Omnibox ─────────────────────────────────────────────────────────────────

export function Omnibox({
  plannedTasks,
  recentTasks,
  projects,
  categories,
  onStarted,
  focusTaskEdit,
  onFocusTaskEditHandled,
}: OmniboxProps) {
  const { runningTask, startTask, pauseTask, resumeTask, stopTask, cancelTask, updateActiveTask } =
    useRunningTask();
  const seconds = useTaskTimer(runningTask);

  // ── Idle draft state ──────────────────────────────────────────────────────
  const [draft, setDraft] = useState<DraftState>({
    name: "",
    projectName: "",
    projectId: null,
    categoryName: "",
    categoryId: null,
    billable: true,
  });
  const [focused, setFocused] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [activeSuggIdx, setActiveSuggIdx] = useState(0);
  const [editingChip, setEditingChip] = useState<"project" | "category" | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // ── Running task UI state ─────────────────────────────────────────────────
  const [confirmingStop, setConfirmingStop] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editFocusField, setEditFocusField] = useState<"name" | "project" | "category" | undefined>();
  const [fillingRequired, setFillingRequired] = useState(false);
  const [fillName, setFillName] = useState("");
  const [fillProjectName, setFillProjectName] = useState("");
  const [fillProjectId, setFillProjectId] = useState<string | null>(null);
  const [fillCategoryName, setFillCategoryName] = useState("");
  const [fillCategoryId, setFillCategoryId] = useState<string | null>(null);
  const [editingStartTime, setEditingStartTime] = useState(false);
  const [startTimeInput, setStartTimeInput] = useState("");

  // ── focusTaskEdit signal from overlay ─────────────────────────────────────
  useEffect(() => {
    if (!focusTaskEdit || !runningTask) return;
    const focusField = !runningTask.name?.trim()
      ? "name"
      : !runningTask.projectId
        ? "project"
        : !runningTask.categoryId
          ? "category"
          : undefined;
    setEditFocusField(focusField);
    setEditing(true);
    onFocusTaskEditHandled?.();
  }, [focusTaskEdit, runningTask, onFocusTaskEditHandled]);

  // ── Close suggestions when clicking outside ───────────────────────────────
  useEffect(() => {
    function onMouseDown(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setShowSuggestions(false);
        setFocused(false);
        setEditingChip(null);
      }
    }
    document.addEventListener("mousedown", onMouseDown);
    return () => document.removeEventListener("mousedown", onMouseDown);
  }, []);

  // ── Derived ───────────────────────────────────────────────────────────────
  const suggestions = buildSuggestions(plannedTasks, recentTasks, projects, categories, draft.name);
  const isRunning = runningTask?.status === "running";
  const displayName = runningTask?.name ?? "(sem nome)";
  const runProject = projects.find((p) => p.id === runningTask?.projectId);
  const runCategory = categories.find((c) => c.id === runningTask?.categoryId);

  // ── Idle: start task ──────────────────────────────────────────────────────
  async function handleStart() {
    await startTask({
      name: draft.name.trim() || null,
      projectId: draft.projectId,
      categoryId: draft.categoryId,
      billable: draft.billable,
    });
    setDraft({ name: "", projectName: "", projectId: null, categoryName: "", categoryId: null, billable: true });
    setShowSuggestions(false);
    onStarted?.();
  }

  function handleSuggestionSelect(s: SuggestionItem) {
    setDraft({
      name: s.name === "(sem nome)" ? "" : s.name,
      projectName: s.projectName ?? "",
      projectId: s.projectId,
      categoryName: s.categoryName ?? "",
      categoryId: s.categoryId,
      billable: s.billable,
    });
    setShowSuggestions(false);
    inputRef.current?.focus();
  }

  function handleInputKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveSuggIdx((i) => Math.min(i + 1, suggestions.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveSuggIdx((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (showSuggestions && suggestions.length > 0) {
        handleSuggestionSelect(suggestions[activeSuggIdx] ?? suggestions[0]);
      } else {
        void handleStart();
      }
    } else if (e.key === "Escape") {
      setShowSuggestions(false);
    }
  }

  // ── Running: play/pause ───────────────────────────────────────────────────
  async function handlePlayPause() {
    if (isRunning) await pauseTask();
    else await resumeTask();
  }

  // ── Running: stop flow ────────────────────────────────────────────────────
  function handleStopClick() {
    if (!runningTask) return;
    const missingName = !runningTask.name?.trim();
    const missingProject = !runningTask.projectId;
    const missingCategory = !runningTask.categoryId;
    if (missingName || missingProject || missingCategory) {
      setFillName(runningTask.name ?? "");
      setFillProjectName(projects.find((p) => p.id === runningTask.projectId)?.name ?? "");
      setFillProjectId(runningTask.projectId);
      setFillCategoryName(categories.find((c) => c.id === runningTask.categoryId)?.name ?? "");
      setFillCategoryId(runningTask.categoryId);
      setFillingRequired(true);
    } else {
      setConfirmingStop(true);
    }
  }

  async function handleFillSubmit() {
    const pId = projects.find((p) => p.name === fillProjectName)?.id ?? fillProjectId ?? null;
    const cId = categories.find((c) => c.name === fillCategoryName)?.id ?? fillCategoryId ?? null;
    await updateActiveTask({ name: fillName.trim() || null, projectId: pId, categoryId: cId });
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
    if (!runningTask) return;
    const d = new Date(runningTask.startTime);
    const hh = String(d.getHours()).padStart(2, "0");
    const mm = String(d.getMinutes()).padStart(2, "0");
    setStartTimeInput(`${hh}:${mm}`);
    setEditingStartTime(true);
  }

  async function handleStartTimeCommit() {
    setEditingStartTime(false);
    if (!runningTask) return;
    const [hh, mm] = startTimeInput.split(":").map(Number);
    if (isNaN(hh) || isNaN(mm)) return;
    const base = new Date(runningTask.startTime);
    base.setHours(hh, mm, 0, 0);
    if (base > new Date()) return;
    await updateActiveTask({ startTime: base.toISOString() });
  }

  // ── Render: Running state ─────────────────────────────────────────────────
  if (runningTask) {
    return (
      <div className="border border-emerald-500/40 bg-emerald-500/5 rounded-xl overflow-hidden">
        {/* Main row */}
        <div className="flex items-center gap-3 px-4 py-3">
          {/* Play/Pause button */}
          <button
            onClick={handlePlayPause}
            title={isRunning ? "Pausar" : "Retomar"}
            className={`flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center transition-colors ${
              isRunning
                ? "bg-emerald-600 hover:bg-emerald-500 text-white"
                : "bg-gray-700 hover:bg-gray-600 text-gray-200"
            }`}
          >
            {isRunning ? <Pause size={16} /> : <Play size={16} />}
          </button>

          {/* Task info */}
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-gray-100 truncate">{displayName}</p>
            <div className="flex gap-2 mt-1 flex-wrap">
              {runProject && (
                <span className="bg-gray-800 border border-gray-700 rounded px-2 py-0.5 text-xs text-gray-300">
                  {runProject.name}
                </span>
              )}
              {runCategory && (
                <span className="bg-gray-800 border border-gray-700 rounded px-2 py-0.5 text-xs text-gray-300">
                  {runCategory.name}
                </span>
              )}
              <button
                type="button"
                onClick={() => runningTask && updateActiveTask({ billable: !runningTask.billable })}
                className={`px-2 py-0.5 rounded text-xs border transition-colors ${
                  runningTask.billable
                    ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/20"
                    : "bg-gray-800/60 border-gray-700/50 text-gray-500 hover:border-gray-600"
                }`}
              >
                {runningTask.billable ? "Billable" : "Non-billable"}
              </button>
              {/* Start time */}
              {editingStartTime ? (
                <input
                  type="time"
                  value={startTimeInput}
                  onChange={(e) => setStartTimeInput(e.target.value)}
                  onBlur={handleStartTimeCommit}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") void handleStartTimeCommit();
                    if (e.key === "Escape") { e.stopPropagation(); setEditingStartTime(false); }
                  }}
                  autoFocus
                  className="w-24 bg-gray-800 border border-blue-500 rounded px-2 py-0.5 text-gray-100 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              ) : (
                <button
                  onClick={handleStartTimeClick}
                  title="Editar hora de início"
                  className="flex items-center gap-1 px-1.5 py-0.5 rounded border border-transparent hover:border-gray-600 hover:bg-gray-800 hover:text-gray-200 text-gray-500 text-xs transition-colors group"
                >
                  início {formatTimeOfDay(runningTask.startTime)}
                  <Pen size={9} className="opacity-0 group-hover:opacity-60 transition-opacity" />
                </button>
              )}
            </div>
          </div>

          {/* Timer + controls */}
          <div className="flex items-center gap-2 flex-shrink-0">
            <span className="font-mono text-xl text-emerald-400 tracking-tight">
              {formatHHMMSS(seconds)}
            </span>
            {confirmingStop ? (
              <div className="flex items-center gap-1">
                <span className="text-xs text-gray-500">Concluída?</span>
                <button
                  onClick={() => handleStopConfirm(true)}
                  className="flex items-center gap-1 px-2 py-1 text-xs bg-green-700 hover:bg-green-600 text-white rounded transition-colors"
                >
                  <CheckCircle2 size={12} />
                  Sim
                </button>
                <button
                  onClick={() => handleStopConfirm(false)}
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
              <div className="flex items-center gap-1">
                <button
                  onClick={handleStopClick}
                  title="Parar"
                  className="p-1.5 text-gray-400 hover:text-red-400 rounded hover:bg-gray-800 transition-colors"
                >
                  <Square size={16} />
                </button>
                <button
                  onClick={() => setEditing((v) => !v)}
                  title="Editar"
                  className={`p-1.5 rounded hover:bg-gray-800 transition-colors ${
                    editing ? "text-blue-400" : "text-gray-400 hover:text-gray-100"
                  }`}
                >
                  <Pencil size={16} />
                </button>
                <button
                  onClick={() => cancelTask()}
                  title="Cancelar tarefa"
                  className="p-1.5 text-gray-400 hover:text-red-400 rounded hover:bg-gray-800 transition-colors"
                >
                  <X size={16} />
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Fill required form */}
        {fillingRequired && (
          <div className="mx-4 mb-3 pt-3 border-t border-emerald-500/20 space-y-2">
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
              options={projects}
              placeholder="Projeto"
            />
            <Autocomplete
              value={fillCategoryName}
              onChange={(v) => {
                setFillCategoryName(v);
                const cat = categories.find((c) => c.name === v);
                if (cat) setFillCategoryId(cat.id);
              }}
              onSelect={(o) => setFillCategoryId(o.id)}
              onEnter={handleFillSubmit}
              options={categories}
              placeholder="Categoria"
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

        {/* Edit form */}
        {editing && (
          <div className="mx-4 mb-3">
            <RunningTaskEditForm
              task={runningTask}
              projects={projects}
              categories={categories}
              focusField={editFocusField}
              onSave={handleSaveEdit}
              onCancel={() => { setEditing(false); setEditFocusField(undefined); }}
            />
          </div>
        )}
      </div>
    );
  }

  // ── Render: Idle state ────────────────────────────────────────────────────
  return (
    <div
      ref={containerRef}
      className={`bg-gradient-to-b from-gray-800/80 to-gray-900/80 border rounded-xl overflow-visible transition-all ${
        focused
          ? "border-blue-500/50 ring-2 ring-blue-500/20"
          : "border-gray-700"
      }`}
    >
      {/* Main input row */}
      <div className="flex items-center gap-3 px-3 py-3">
        {/* Play button */}
        <button
          type="button"
          onClick={() => void handleStart()}
          title="Iniciar tarefa"
          className="flex-shrink-0 w-10 h-10 rounded-full bg-blue-600 hover:bg-blue-500 text-white flex items-center justify-center transition-colors"
        >
          <Play size={18} />
        </button>

        {/* Name input */}
        <input
          ref={inputRef}
          type="text"
          value={draft.name}
          onChange={(e) => {
            setDraft((d) => ({ ...d, name: e.target.value }));
            setShowSuggestions(true);
            setActiveSuggIdx(0);
          }}
          onFocus={() => {
            setFocused(true);
            setShowSuggestions(true);
          }}
          onBlur={() => setFocused(false)}
          onKeyDown={handleInputKeyDown}
          placeholder="Em que você está trabalhando?"
          className="flex-1 bg-transparent text-[15px] font-medium text-gray-100 placeholder-gray-500 focus:outline-none"
        />
      </div>

      {/* Chips row */}
      <div className="flex gap-2 px-4 pb-3 flex-wrap">
        {editingChip === "project" ? (
          <div className="w-40">
            <Autocomplete
              value={draft.projectName}
              onChange={(v) => setDraft((d) => ({ ...d, projectName: v }))}
              onSelect={(o) => {
                setDraft((d) => ({ ...d, projectName: o.name, projectId: o.id }));
                setEditingChip(null);
              }}
              onEnter={() => setEditingChip(null)}
              options={projects}
              placeholder="Projeto"
              autoFocus
            />
          </div>
        ) : (
          <Chip
            label={draft.projectName || "Projeto"}
            filled={!!draft.projectName}
            onClick={() => setEditingChip("project")}
          />
        )}

        {editingChip === "category" ? (
          <div className="w-40">
            <Autocomplete
              value={draft.categoryName}
              onChange={(v) => setDraft((d) => ({ ...d, categoryName: v }))}
              onSelect={(o) => {
                const cat = categories.find((c) => c.id === o.id);
                setDraft((d) => ({
                  ...d,
                  categoryName: o.name,
                  categoryId: o.id,
                  billable: cat?.defaultBillable ?? d.billable,
                }));
                setEditingChip(null);
              }}
              onEnter={() => setEditingChip(null)}
              options={categories}
              placeholder="Categoria"
              autoFocus
            />
          </div>
        ) : (
          <Chip
            label={draft.categoryName || "Categoria"}
            filled={!!draft.categoryName}
            onClick={() => setEditingChip("category")}
          />
        )}

        <Chip
          label={draft.billable ? "Billable" : "Non-billable"}
          filled
          billable={draft.billable}
          isBillableChip
          onClick={() => setDraft((d) => ({ ...d, billable: !d.billable }))}
        />
      </div>

      {/* Suggestions dropdown */}
      {showSuggestions && suggestions.length > 0 && (
        <div className="border-t border-gray-700/60 bg-gray-900/95 rounded-b-xl overflow-hidden">
          <ul>
            {suggestions.map((s, idx) => (
              <li
                key={s.key}
                onMouseDown={() => handleSuggestionSelect(s)}
                onMouseEnter={() => setActiveSuggIdx(idx)}
                className={`flex items-center gap-3 px-4 py-2.5 cursor-pointer transition-colors ${
                  idx === activeSuggIdx
                    ? "bg-blue-600/20 text-gray-100"
                    : "text-gray-300 hover:bg-gray-800/60"
                }`}
              >
                {/* Dot indicator */}
                <span
                  className={`flex-shrink-0 w-2 h-2 rounded-full ${
                    s.billable ? "bg-blue-400" : "bg-gray-500"
                  }`}
                />
                <span className="flex-1 text-sm truncate">{s.name}</span>
                <div className="flex items-center gap-2 flex-shrink-0">
                  {s.isPlanned && (
                    <span className="text-[10px] text-blue-400 font-medium uppercase tracking-wide">
                      planejada
                    </span>
                  )}
                  {s.projectName && (
                    <span className="text-xs text-gray-500 truncate max-w-[80px]">
                      {s.projectName}
                    </span>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
