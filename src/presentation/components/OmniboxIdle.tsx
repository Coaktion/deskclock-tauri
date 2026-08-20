import { Play } from "lucide-react";
import type { PlannedTask } from "@domain/entities/PlannedTask";
import type { Project } from "@domain/entities/Project";
import type { Category } from "@domain/entities/Category";
import { Input, TaskRow } from "@presentation/components/ui";
import { getProjectColor } from "@shared/utils/projectColor";
import { Autocomplete } from "./Autocomplete";
import {
  chipBillableClass,
  chipEmptyClass,
  chipFilledClass,
  chipNonBillableClass,
} from "./chipStyles";
import type { useOmniboxDraft } from "@presentation/hooks/useOmniboxDraft";
import { useProjectCategoryMap } from "@presentation/hooks/useProjectCategoryMap";

// ─── Chip ─────────────────────────────────────────────────────────────────────

interface ChipProps {
  label: string;
  filled: boolean;
  billable?: boolean;
  isBillableChip?: boolean;
  onClick: () => void;
}

function Chip({ label, filled, billable, isBillableChip, onClick }: ChipProps) {
  const className = isBillableChip
    ? billable
      ? chipBillableClass
      : chipNonBillableClass
    : filled
      ? chipFilledClass
      : chipEmptyClass;

  return (
    <button type="button" onClick={onClick} className={className}>
      {label}
    </button>
  );
}

// ─── OmniboxIdle ──────────────────────────────────────────────────────────────

type DraftHookState = ReturnType<typeof useOmniboxDraft>;

interface OmniboxIdleProps extends DraftHookState {
  projects: Project[];
  categories: Category[];
  containerRef: React.RefObject<HTMLDivElement | null>;
  /** O chip de faturamento é controle em toda parte, inclusive na sugestão. */
  onToggleBillable: (task: PlannedTask) => void;
  /** Destino do "Ver semana →" no rodapé da lista. */
  onNavigatePlanning?: () => void;
}

export function OmniboxIdle({
  projects,
  categories,
  containerRef,
  onToggleBillable,
  onNavigatePlanning,
  draft,
  setDraft,
  focused,
  setFocused,
  showSuggestions,
  setShowSuggestions,
  activeSuggIdx,
  editingChip,
  setEditingChip,
  inputRef,
  suggestions,
  startPlanned,
  handleStart,
  handleInputKeyDown,
}: OmniboxIdleProps) {
  const { categoriesFor } = useProjectCategoryMap();
  const categoryOptions = categoriesFor(categories, draft.projectId);

  return (
    <div
      ref={containerRef}
      className={`relative bg-surface border rounded-card overflow-visible transition-all ${
        focused ? "border-accent ring-2 ring-accent/20" : "border-border"
      }`}
    >
      {/* Main input row */}
      <div className="flex items-center gap-3 px-3 py-3">
        <button
          type="button"
          onClick={() => void handleStart()}
          title="Iniciar tarefa"
          className="shrink-0 w-10 h-10 rounded-full bg-accent hover:opacity-90 text-white flex items-center justify-center transition-opacity"
        >
          <Play size={18} />
        </button>

        <Input
          ref={inputRef}
          variant="plain"
          value={draft.name}
          onChange={(e) => {
            setDraft((d) => ({ ...d, name: e.target.value }));
            setShowSuggestions(true);
          }}
          onFocus={() => {
            setFocused(true);
            setShowSuggestions(true);
          }}
          onBlur={() => setFocused(false)}
          onKeyDown={handleInputKeyDown}
          placeholder="Em que você está trabalhando?"
          className="flex-1 text-lead! font-medium"
        />
      </div>

      {/* Chips row */}
      <div className="flex gap-2 px-3 pb-3 flex-wrap">
        {editingChip === "project" ? (
          <div className="w-40">
            <Autocomplete
              value={draft.projectName}
              onChange={(v) => setDraft((d) => ({ ...d, projectName: v }))}
              onSelect={(o) => {
                // Trocar o projeto zera a categoria: o recorte de opções mudou.
                setDraft((d) => ({
                  ...d,
                  projectName: o.name,
                  projectId: o.id,
                  categoryName: "",
                  categoryId: null,
                }));
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
              options={categoryOptions}
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

      {/*
       * As planejadas do dia, penduradas no card e **fora do fluxo**: em fluxo,
       * abri-la a cada foco empurraria os KPIs e as Entradas tela abaixo — que é
       * metade da queixa que tirou a lista daqui em `86e3245`.
       *
       * Escolher uma **inicia** a tarefa; o chip de faturamento barra a
       * propagação por conta própria, então ele continua alternando sem
       * disparar a linha em volta.
       */}
      {showSuggestions && suggestions.length > 0 && (
        <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-raised border border-border rounded-card shadow-lg overflow-hidden">
          <div className="max-h-40 overflow-y-auto">
            {suggestions.map((task, idx) => {
              const project = projects.find((p) => p.id === task.projectId);
              const category = categories.find((c) => c.id === task.categoryId);
              const subtitle = [project?.name, category?.name].filter(Boolean).join(" · ");

              return (
                <TaskRow
                  key={task.id}
                  title={task.name || "(sem nome)"}
                  subtitle={subtitle || undefined}
                  billable={task.billable}
                  onToggleBillable={() => onToggleBillable(task)}
                  dotColor={getProjectColor(project)}
                  selected={idx === activeSuggIdx}
                  onClick={() => void startPlanned(task)}
                />
              );
            })}
          </div>

          {onNavigatePlanning && (
            <div className="border-t border-border-subtle px-3 py-2 text-right">
              <button
                type="button"
                onClick={onNavigatePlanning}
                className="text-micro text-accent-text hover:opacity-80 transition-opacity"
              >
                Ver semana →
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
