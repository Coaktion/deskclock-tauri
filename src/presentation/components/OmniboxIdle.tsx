import { Play } from "lucide-react";
import type { Project } from "@domain/entities/Project";
import type { Category } from "@domain/entities/Category";
import { Autocomplete } from "./Autocomplete";
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
      className={`bg-gradient-to-b from-gray-800/80 to-gray-900/80 border rounded-xl overflow-visible transition-all ${
        focused ? "border-blue-500/50 ring-2 ring-blue-500/20" : "border-gray-700"
      }`}
    >
      {/* Main input row */}
      <div className="flex items-center gap-3 px-3 py-3">
        <button
          type="button"
          onClick={() => void handleStart()}
          title="Iniciar tarefa"
          className="flex-shrink-0 w-10 h-10 rounded-full bg-blue-600 hover:bg-blue-500 text-white flex items-center justify-center transition-colors"
        >
          <Play size={18} />
        </button>

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
          autoComplete="off"
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
        <div className="border-t border-gray-700/60 bg-gray-900/95 rounded-b-xl overflow-hidden">
          <ul>
            {suggestions.map((s: SuggestionItem, idx: number) => (
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
