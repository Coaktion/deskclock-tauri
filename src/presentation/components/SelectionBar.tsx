import { Trash2 } from "lucide-react";

interface SelectionBarProps {
  count: number;
  allSelected: boolean;
  onToggleAll: () => void;
  onDelete: () => void;
}

/** Cabeçalho de seleção múltipla das listas da tela de Dados. */
export function SelectionBar({ count, allSelected, onToggleAll, onDelete }: SelectionBarProps) {
  const hasSelection = count > 0;

  return (
    <div className="flex items-center gap-2.5 px-3 py-1.5">
      <label className="flex items-center gap-2.5 cursor-pointer select-none">
        <input
          type="checkbox"
          checked={allSelected}
          // Seleção parcial: traço em vez de vazio, senão o rótulo diz "3 itens
          // selecionados" com a caixa desmarcada.
          ref={(el) => {
            if (el) el.indeterminate = hasSelection && !allSelected;
          }}
          onChange={onToggleAll}
          className="shrink-0 accent-accent cursor-pointer"
        />
        <span className="text-sm text-fg-muted">
          {hasSelection
            ? `${count} ${count === 1 ? "item selecionado" : "itens selecionados"}`
            : "Selecionar todos"}
        </span>
      </label>

      {/* Sempre no fluxo, invisível sem seleção: mostrar/esconder deslocaria a lista. */}
      <button
        type="button"
        onClick={onDelete}
        disabled={!hasSelection}
        className={`ml-auto flex items-center gap-1 px-2 py-1 text-sm text-danger hover:opacity-80 bg-raised border border-border hover:border-danger/40 rounded-control transition-colors ${
          hasSelection ? "" : "invisible pointer-events-none"
        }`}
      >
        <Trash2 size={14} />
        Excluir selecionados
      </button>
    </div>
  );
}
