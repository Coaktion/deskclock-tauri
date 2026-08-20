import { ArrowRight, CheckCircle2, Clock, ListChecks, Pause, Pen, Play, X } from "lucide-react";
import type { Task } from "@domain/entities/Task";
import type { Project } from "@domain/entities/Project";
import type { Category } from "@domain/entities/Category";
import type { PlannedTaskAction } from "@domain/entities/PlannedTask";
import { countFilledCustomValues } from "@domain/usecases/customFields/countFilledCustomValues";
import { ActionChip } from "./ActionChip";
import { Autocomplete } from "./Autocomplete";
import {
  chipBillableClass,
  chipEmptyClass,
  chipFilledClass,
  chipNonBillableClass,
} from "./chipStyles";
import { Input } from "@presentation/components/ui";
import { OmniboxCustomFieldsPanel } from "./OmniboxCustomFieldsPanel";
import { useCustomFields } from "@presentation/hooks/useCustomFields";
import { useProjectCategoryMap } from "@presentation/hooks/useProjectCategoryMap";
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
  clearFillCategory,
  editingStartTime,
  startTimeInput,
  setStartTimeInput,
  editingCustomFields,
  setEditingCustomFields,
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
  handleCustomValuesSave,
}: OmniboxRunningProps) {
  const runProject = projects.find((p) => p.id === runningTask.projectId);
  const runCategory = categories.find((c) => c.id === runningTask.categoryId);
  const { activeFields } = useCustomFields();
  const filledCustomValues = countFilledCustomValues(activeFields, runningTask.customValues);

  // Dois recortes diferentes: o chip edita a categoria da tarefa em execução, e o
  // preenchimento obrigatório trabalha sobre o projeto que está sendo digitado
  // ali — que ainda não é o da tarefa. `runCategory` continua saindo do catálogo
  // cheio, ou desassociar a categoria apagaria o nome dela do chip.
  const { categoriesFor } = useProjectCategoryMap();
  const runningCategoryOptions = categoriesFor(categories, runningTask.projectId);
  const fillCategoryOptions = categoriesFor(
    categories,
    projects.find((p) => p.name === fillProjectName)?.id ?? runningTask.projectId
  );

  return (
    <div
      ref={containerRef}
      className={`border rounded-card overflow-visible ${
        isRunning ? "border-accent/40 bg-accent/5" : "border-paused/40 bg-paused/5"
      }`}
    >
      {/* Linha 1 — o mesmo esqueleto do repouso (botão de 40px + nome no degrau
          `lead`), com o timer ocupando a ponta que lá fica vazia. Dar play troca
          o ícone e acende o timer; não remonta a caixa. */}
      <div className="flex items-center gap-3 px-3 py-3">
        {/* Play/Pause button */}
        <button
          onClick={handlePlayPause}
          title={isRunning ? "Pausar" : "Retomar"}
          className={`shrink-0 w-10 h-10 rounded-full flex items-center justify-center transition-opacity text-white hover:opacity-90 ${
            isRunning ? "bg-accent animate-pulse" : "bg-paused"
          }`}
        >
          {isRunning ? <Pause size={18} /> : <Play size={18} />}
        </button>

        {/* Task name */}
        <div className="flex-1 min-w-0">
          {editingRunningName ? (
            <Input
              variant="plain"
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
              className="text-lead! font-medium border-b border-accent"
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
                className={`text-lead font-medium truncate ${runningTask.name ? "text-fg" : "text-fg-muted italic"}`}
              >
                {runningTask.name ?? "(sem nome)"}
              </span>
              <Pen
                size={14}
                className="shrink-0 opacity-0 group-hover:opacity-40 transition-opacity"
              />
            </button>
          )}
        </div>

        {/* Timer */}
        <span
          className={`shrink-0 font-mono tabular-nums text-2xl tracking-tight leading-none ${
            isRunning ? "text-accent-text" : "text-paused"
          }`}
        >
          {formatHHMMSS(seconds)}
        </span>

        {/* Cancelar mora aqui, na ponta superior direita, pelo mesmo motivo do
            overlay popup: encostado no Parar, o descarte ficava a um pixel da
            ação que salva. */}
        <button
          onClick={() => void cancelTask()}
          title="Cancelar tarefa"
          className="shrink-0 p-1 text-fg-muted hover:text-danger hover:bg-danger/10 rounded-control transition-colors"
        >
          <X size={14} />
        </button>
      </div>

      {/* Linha 2 — a faixa de chips do repouso, no mesmo eixo do botão. À direita,
          debaixo do timer, o início e os controles de parada. */}
      <div className="flex items-center gap-2 px-3 pb-3">
        <div className="flex-1 min-w-0 flex gap-2 flex-wrap items-center">
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
              className={runProject ? chipFilledClass : chipEmptyClass}
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
                options={runningCategoryOptions}
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
              className={runCategory ? chipFilledClass : chipEmptyClass}
            >
              {runCategory?.name ?? "Categoria"}
            </button>
          )}

          {/* Billable chip */}
          <button
            type="button"
            onClick={() => void handleBillableToggle(runningTask.billable)}
            className={runningTask.billable ? chipBillableClass : chipNonBillableClass}
          >
            {runningTask.billable ? "Billable" : "Non-billable"}
          </button>

          {/* Campos personalizados: o chip diz quantos já têm valor, e o painel
                abre abaixo. Sem ele, quem trabalha pelo omnibox só descobria o
                Project Stage em branco quando o envio ao Monday recusava a
                atividade (§5.7). */}
          {activeFields.length > 0 && (
            <button
              type="button"
              onClick={() => setEditingCustomFields(!editingCustomFields)}
              title="Campos personalizados"
              className={`inline-flex items-center gap-1 ${
                filledCustomValues > 0 ? chipFilledClass : chipEmptyClass
              }`}
            >
              <ListChecks size={14} />
              Campos · {filledCustomValues}/{activeFields.length}
            </button>
          )}
        </div>

        <div className="shrink-0 flex items-center gap-1">
          {/* Início. O slot é uma caixa fixa de 128×24 que as duas versões
              preenchem, então entrar em edição troca o conteúdo sem mover nada —
              antes o campo era mais largo que o botão e o `flex-wrap` dos chips
              o jogava para a linha de baixo no meio da digitação.

              A altura vem de `h-6`, não do padding: o `input[type=time]` do
              Chromium mede 26,86 com o mesmo `py-0.75` que fecha o chip em
              24,53 — o interior dele é o `-webkit-datetime-edit`, que traz a
              própria caixa e ignora entrelinha. Medido na bancada. */}
          <div className="w-32 flex">
            {editingStartTime ? (
              <Input
                type="time"
                variant="plain"
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
                className="h-6 bg-raised border border-accent rounded-chip px-2"
              />
            ) : (
              <button
                onClick={handleStartTimeClick}
                title="Editar hora de início"
                className="w-full h-6 flex items-center justify-center gap-1 px-2 rounded-chip border border-transparent hover:border-border hover:bg-raised hover:text-fg-secondary text-fg-muted text-sm whitespace-nowrap transition-colors group"
              >
                início {formatTimeOfDay(runningTask.startTime)}
                <Pen size={14} className="opacity-0 group-hover:opacity-60 transition-opacity" />
              </button>
            )}
          </div>

          {confirmingStop ? (
            <div className="flex items-center gap-1">
              <span className="text-sm text-fg-muted">Concluída?</span>
              <button
                onClick={() => handleStopConfirm(true)}
                className="flex items-center gap-1 px-2 py-0.75 text-sm font-medium bg-accent/10 border border-accent/30 text-accent-text hover:bg-accent/20 rounded-control transition-colors"
              >
                <CheckCircle2 size={14} />
                Sim
              </button>
              <button
                onClick={() => handleStopConfirm(false)}
                className="flex items-center gap-1 px-2 py-0.75 text-sm font-medium bg-raised border border-border text-fg-secondary hover:text-fg rounded-control transition-colors"
              >
                <Clock size={14} />
                Não
              </button>
              <button
                onClick={() => setConfirmingStop(false)}
                className="p-1 text-fg-muted hover:text-fg-secondary rounded-control transition-colors"
              >
                <X size={14} />
              </button>
            </div>
          ) : (
            <button
              onClick={handleStopClick}
              title="Parar tarefa"
              className="px-3 py-0.75 text-sm font-medium bg-danger/10 border border-danger/30 text-danger hover:bg-danger/20 rounded-control transition-colors"
            >
              Parar
            </button>
          )}
        </div>
      </div>

      {/* Campos personalizados (painel embutido) */}
      {editingCustomFields && activeFields.length > 0 && (
        <OmniboxCustomFieldsPanel
          task={runningTask}
          fields={activeFields}
          onSave={handleCustomValuesSave}
          onClose={() => setEditingCustomFields(false)}
        />
      )}

      {/* Actions section */}
      {actions.length > 0 && (
        <div className="flex items-center gap-2 flex-wrap px-3 pb-3 pt-2 border-t border-border-subtle">
          <span className="text-overline uppercase text-fg-muted shrink-0">Ações</span>
          {actions.map((action, i) => (
            <ActionChip key={i} action={action} />
          ))}
        </div>
      )}

      {/* Fill required form */}
      {fillingRequired && (
        <div className="mx-3 mb-3 pt-3 border-t border-border-subtle space-y-2">
          <p className="text-xs text-amber-400">Preencha antes de concluir:</p>
          <Input
            value={fillName}
            onChange={(e) => setFillName(e.target.value)}
            placeholder="Nome da tarefa"
            autoFocus
          />
          <Autocomplete
            value={fillProjectName}
            onChange={setFillProjectName}
            onSelect={(o) => {
              setFillProjectName(o.name);
              clearFillCategory();
            }}
            options={projects}
            placeholder="Projeto"
          />
          <Autocomplete
            value={fillCategoryName}
            onChange={setFillCategoryName}
            onSelect={(o) => setFillCategoryName(o.name)}
            onEnter={handleFillSubmit}
            options={fillCategoryOptions}
            placeholder="Categoria"
          />
          <div className="flex gap-2 justify-end">
            <button
              onClick={() => setFillingRequired(false)}
              className="px-3 py-1.5 text-sm text-fg-muted hover:text-fg transition-colors"
            >
              Cancelar
            </button>
            <button
              onClick={handleFillSubmit}
              className="flex items-center gap-1 px-3 py-1.5 text-sm font-medium bg-accent/10 border border-accent/30 text-accent-text hover:bg-accent/20 rounded-control transition-colors"
            >
              <ArrowRight size={14} />
              Continuar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
