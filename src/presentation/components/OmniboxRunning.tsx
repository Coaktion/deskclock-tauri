import { ArrowRight, CheckCircle2, Clock, Pause, Pen, Play, X } from "lucide-react";
import type { Task } from "@domain/entities/Task";
import type { Project } from "@domain/entities/Project";
import type { Category } from "@domain/entities/Category";
import type { PlannedTaskAction } from "@domain/entities/PlannedTask";
import { ActionChip } from "./ActionChip";
import { Autocomplete } from "./Autocomplete";
import { formatHHMMSS, formatTimeOfDay } from "@shared/utils/time";
import type { OmniboxRunningEditState } from "@presentation/hooks/useOmniboxRunningEdit";

interface OmniboxRunningProps extends OmniboxRunningEditState {
  runningTask: Task;
  projects: Project[];
  categories: Category[];
  seconds: number;
  cancelTask: () => Promise<void>;
  containerRef: React.RefObject<HTMLDivElement | null>;
  actions: PlannedTaskAction[];
}

export function OmniboxRunning({
  runningTask,
  projects,
  categories,
  seconds,
  cancelTask,
  containerRef,
  actions,
  confirmingStop,
  setConfirmingStop,
  editingRunningChip,
  setEditingRunningChip,
  runningChipValue,
  setRunningChipValue,
  editingRunningName,
  setEditingRunningName,
  runningNameValue,
  setRunningNameValue,
  fillingRequired,
  setFillingRequired,
  fillName,
  setFillName,
  fillProjectName,
  setFillProjectName,
  fillCategoryName,
  setFillCategoryName,
  editingStartTime,
  startTimeInput,
  setStartTimeInput,
  isRunning,
  handlePlayPause,
  handleStopClick,
  handleFillSubmit,
  handleStopConfirm,
  handleNameCommit,
  handleStartTimeClick,
  handleStartTimeCommit,
  handleProjectSelect,
  handleCategorySelect,
  handleBillableToggle,
}: OmniboxRunningProps) {
  const runProject = projects.find((p) => p.id === runningTask.projectId);
  const runCategory = categories.find((c) => c.id === runningTask.categoryId);

  return (
    <div
      ref={containerRef}
      className="border border-emerald-500/40 bg-emerald-500/5 rounded-xl overflow-visible"
    >
      {/* Main row */}
      <div className="flex items-center gap-3 px-4 py-3">
        {/* Play/Pause button */}
        <button
          onClick={handlePlayPause}
          title={isRunning ? "Pausar" : "Retomar"}
          className={`flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center transition-colors ${
            isRunning
              ? "bg-emerald-600 hover:bg-emerald-500 text-white animate-pulse"
              : "bg-gray-700 hover:bg-gray-600 text-gray-200"
          }`}
        >
          {isRunning ? <Pause size={16} /> : <Play size={16} />}
        </button>

        {/* Task info */}
        <div className="flex-1 min-w-0">
          {editingRunningName ? (
            <input
              type="text"
              value={runningNameValue}
              onChange={(e) => setRunningNameValue(e.target.value)}
              onBlur={() => void handleNameCommit()}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  void handleNameCommit();
                }
                if (e.key === "Escape") {
                  e.stopPropagation();
                  setEditingRunningName(false);
                }
              }}
              autoFocus
              placeholder="Nome da tarefa"
              className="w-full text-sm font-medium bg-transparent border-b border-blue-500 text-gray-100 placeholder-gray-500 focus:outline-none pb-0.5"
            />
          ) : (
            <button
              type="button"
              onClick={() => {
                setRunningNameValue(runningTask.name ?? "");
                setEditingRunningName(true);
              }}
              title="Editar nome"
              className="flex items-center gap-1 w-full text-left group"
            >
              <span
                className={`text-sm font-medium truncate ${runningTask.name ? "text-gray-100" : "text-gray-500 italic"}`}
              >
                {runningTask.name ?? "(sem nome)"}
              </span>
              <Pen
                size={10}
                className="flex-shrink-0 opacity-0 group-hover:opacity-40 transition-opacity"
              />
            </button>
          )}

          <div className="flex gap-2 mt-1 flex-wrap items-center">
            {/* Project chip */}
            {editingRunningChip === "project" ? (
              <div
                className="w-40"
                onBlur={(e) => {
                  if (!e.currentTarget.contains(e.relatedTarget as Node)) {
                    setEditingRunningChip(null);
                  }
                }}
              >
                <Autocomplete
                  value={runningChipValue}
                  onChange={setRunningChipValue}
                  onSelect={(o) => void handleProjectSelect(o.id)}
                  onEnter={() => setEditingRunningChip(null)}
                  options={projects}
                  placeholder="Projeto"
                  autoFocus
                />
              </div>
            ) : (
              <button
                type="button"
                onClick={() => {
                  setRunningChipValue(runProject?.name ?? "");
                  setEditingRunningChip("project");
                }}
                className={
                  runProject
                    ? "bg-gray-800 border border-gray-700 rounded px-2 py-0.5 text-xs text-gray-300 hover:bg-gray-700 transition-colors"
                    : "border border-dashed border-gray-600 rounded px-2 py-0.5 text-xs text-gray-500 hover:border-gray-500 hover:text-gray-400 transition-colors"
                }
              >
                {runProject?.name ?? "Projeto"}
              </button>
            )}

            {/* Category chip */}
            {editingRunningChip === "category" ? (
              <div
                className="w-40"
                onBlur={(e) => {
                  if (!e.currentTarget.contains(e.relatedTarget as Node)) {
                    setEditingRunningChip(null);
                  }
                }}
              >
                <Autocomplete
                  value={runningChipValue}
                  onChange={setRunningChipValue}
                  onSelect={(o) => {
                    const cat = categories.find((c) => c.id === o.id);
                    void handleCategorySelect(o.id, cat?.defaultBillable ?? runningTask.billable);
                  }}
                  onEnter={() => setEditingRunningChip(null)}
                  options={categories}
                  placeholder="Categoria"
                  autoFocus
                />
              </div>
            ) : (
              <button
                type="button"
                onClick={() => {
                  setRunningChipValue(runCategory?.name ?? "");
                  setEditingRunningChip("category");
                }}
                className={
                  runCategory
                    ? "bg-gray-800 border border-gray-700 rounded px-2 py-0.5 text-xs text-gray-300 hover:bg-gray-700 transition-colors"
                    : "border border-dashed border-gray-600 rounded px-2 py-0.5 text-xs text-gray-500 hover:border-gray-500 hover:text-gray-400 transition-colors"
                }
              >
                {runCategory?.name ?? "Categoria"}
              </button>
            )}

            {/* Billable chip */}
            <button
              type="button"
              onClick={() => void handleBillableToggle(runningTask.billable)}
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
                onBlur={() => void handleStartTimeCommit()}
                onKeyDown={(e) => {
                  if (e.key === "Enter") void handleStartTimeCommit();
                  if (e.key === "Escape") {
                    e.stopPropagation();
                    setStartTimeInput("");
                  }
                }}
                autoFocus
                className="w-24 bg-gray-800 border border-blue-500 rounded-lg px-2 py-0.5 text-gray-100 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            ) : (
              <button
                onClick={handleStartTimeClick}
                title="Editar hora de início"
                className="flex items-center gap-1 px-1.5 py-0.5 rounded-lg border border-transparent hover:border-gray-600 hover:bg-gray-800 hover:text-gray-200 text-gray-500 text-xs transition-colors group"
              >
                início {formatTimeOfDay(runningTask.startTime)}
                <Pen size={9} className="opacity-0 group-hover:opacity-60 transition-opacity" />
              </button>
            )}
          </div>
        </div>

        {/* Timer + controls */}
        <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
          <span className="font-mono tabular-nums text-2xl text-emerald-400 tracking-tight leading-none">
            {formatHHMMSS(seconds)}
          </span>
          {confirmingStop ? (
            <div className="flex items-center gap-1">
              <span className="text-xs text-gray-500">Concluída?</span>
              <button
                onClick={() => handleStopConfirm(true)}
                className="flex items-center gap-1 px-2 py-1 text-xs bg-green-700 hover:bg-green-600 text-white rounded-lg transition-colors"
              >
                <CheckCircle2 size={12} />
                Sim
              </button>
              <button
                onClick={() => handleStopConfirm(false)}
                className="flex items-center gap-1 px-2 py-1 text-xs bg-gray-700 hover:bg-gray-600 text-gray-200 rounded-lg transition-colors"
              >
                <Clock size={12} />
                Não
              </button>
              <button
                onClick={() => setConfirmingStop(false)}
                className="p-1 text-gray-600 hover:text-gray-400 rounded-lg"
              >
                <X size={12} />
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-1">
              <button
                onClick={handleStopClick}
                title="Parar tarefa"
                className="px-3 py-1 text-xs font-medium bg-red-500/10 border border-red-500/30 text-red-400 hover:bg-red-500/20 rounded-lg transition-colors"
              >
                Parar
              </button>
              <button
                onClick={() => void cancelTask()}
                title="Cancelar tarefa"
                className="p-1.5 text-gray-600 hover:text-red-400 rounded-lg hover:bg-gray-800 transition-colors"
              >
                <X size={13} />
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Actions section */}
      {actions.length > 0 && (
        <div className="flex items-center gap-2 flex-wrap px-4 pb-3 pt-2 border-t border-emerald-500/20">
          <span className="text-[9px] font-bold uppercase tracking-widest text-gray-600 shrink-0">
            Ações
          </span>
          {actions.map((action, i) => (
            <ActionChip key={i} action={action} />
          ))}
        </div>
      )}

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
            className="w-full px-2.5 py-1.5 text-sm bg-gray-800 border border-gray-700 rounded-lg text-gray-100 placeholder-gray-500 focus:outline-none focus:border-blue-500"
          />
          <Autocomplete
            value={fillProjectName}
            onChange={setFillProjectName}
            onSelect={(o) => setFillProjectName(o.name)}
            options={projects}
            placeholder="Projeto"
          />
          <Autocomplete
            value={fillCategoryName}
            onChange={setFillCategoryName}
            onSelect={(o) => setFillCategoryName(o.name)}
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
              className="flex items-center gap-1 px-3 py-1.5 text-xs bg-blue-600 hover:bg-blue-500 text-white rounded-lg transition-colors"
            >
              <ArrowRight size={12} />
              Continuar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
