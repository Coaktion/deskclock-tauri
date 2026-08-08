import { Play } from "lucide-react";
import type { Project } from "@domain/entities/Project";
import type { Category } from "@domain/entities/Category";
import { Input } from "@presentation/components/ui";
import { Autocomplete } from "./Autocomplete";
import {
  chipBillableClass,
  chipEmptyClass,
  chipFilledClass,
  chipNonBillableClass,
} from "./chipStyles";
import type { useOmniboxDraft } from "@presentation/hooks/useOmniboxDraft";
import { useProjectCategoryMap } from "@presentation/hooks/useProjectCategoryMap";
import type { SuggestionItem } from "@presentation/hooks/useOmniboxSuggestions";

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
}

export function OmniboxIdle({
  projects,
  categories,
  containerRef,
  draft,
  setDraft,
  focused,
  setFocused,
  showSuggestions,
  setShowSuggestions,
  activeSuggIdx,
  setActiveSuggIdx,
  editingChip,
  setEditingChip,
  inputRef,
  suggestions,
  handleStart,
  handleSuggestionSelect,
  handleInputKeyDown,
}: OmniboxIdleProps) {
  const { categoriesFor } = useProjectCategoryMap();
  const categoryOptions = categoriesFor(categories, draft.projectId);

  return (
    <div
      ref={containerRef}
      className={`bg-surface border rounded-card overflow-visible transition-all ${
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
            setActiveSuggIdx(0);
          }}
          onFocus={() => {
            setFocused(true);
            setShowSuggestions(true);
          }}
          onBlur={() => setFocused(false)}
          onKeyDown={handleInputKeyDown}
          placeholder="Em que você está trabalhando?"
          className="flex-1 text-base! font-medium"
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

      {/* Suggestions dropdown */}
      {showSuggestions && suggestions.length > 0 && (
        <div className="border-t border-border-subtle bg-raised rounded-b-card overflow-hidden">
          <ul>
            {suggestions.map((s: SuggestionItem, idx: number) => (
              <li
                key={s.key}
                onMouseDown={() => handleSuggestionSelect(s)}
                onMouseEnter={() => setActiveSuggIdx(idx)}
                className={`flex items-center gap-3 px-4 py-2.5 cursor-pointer transition-colors ${
                  idx === activeSuggIdx ? "bg-accent/15 text-fg" : "text-fg-secondary"
                }`}
              >
                <span
                  className={`shrink-0 w-2 h-2 rounded-full ${
                    s.billable ? "bg-billable" : "bg-fg-muted"
                  }`}
                />
                <span className="flex-1 text-sm truncate">{s.name}</span>
                <div className="flex items-center gap-2 shrink-0">
                  {s.isPlanned && (
                    <span className="text-overline uppercase text-accent-text">planejada</span>
                  )}
                  {s.projectName && (
                    <span className="text-xs text-fg-muted truncate max-w-[80px]">
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
