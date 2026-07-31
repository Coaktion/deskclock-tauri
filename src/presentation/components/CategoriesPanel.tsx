import { useMemo, useState } from "react";
import { Plus, Upload } from "lucide-react";
import type { UseCategoriesResult } from "@presentation/hooks/useCategories";
import { useMultiSelect } from "@presentation/hooks/useMultiSelect";
import { SearchInput } from "./SearchInput";
import { ToggleBillable } from "./ToggleBillable";
import { CategoryCard } from "./CategoryCard";
import { SelectionBar } from "./SelectionBar";
import { BulkImportModal } from "@presentation/modals/BulkImportModal";
import { fuzzyMatch } from "@shared/utils/fuzzySearch";

interface CategoriesPanelProps {
  showTitle?: boolean;
  /** Injetado pela página: o contador da aba lê a mesma instância do hook que a lista. */
  data: UseCategoriesResult;
}

export function CategoriesPanel({ showTitle = true, data }: CategoriesPanelProps) {
  const {
    categories,
    loading,
    createCategory,
    bulkImportCategories,
    updateCategory,
    deleteCategory,
    deleteCategories,
  } = data;
  const [search, setSearch] = useState("");
  const [newName, setNewName] = useState("");
  const [newBillable, setNewBillable] = useState(true);
  const [bulkOpen, setBulkOpen] = useState(false);

  const filtered = useMemo(
    () => categories.filter((c) => fuzzyMatch(search, c.name)),
    [categories, search]
  );
  const visibleIds = useMemo(() => filtered.map((c) => c.id), [filtered]);
  const selection = useMultiSelect(visibleIds);

  async function handleAdd() {
    if (!newName.trim()) return;
    try {
      await createCategory(newName, newBillable);
      setNewName("");
    } catch {
      // duplicata ou nome inválido
    }
  }

  async function handleDeleteSelected() {
    const ids = [...selection.selected];
    try {
      await deleteCategories(ids);
      selection.unselect(ids);
    } catch {
      // Falha na exclusão: a seleção fica de pé para o usuário tentar de novo.
    }
  }

  return (
    <div className="flex flex-col gap-3">
      {showTitle && <h2 className="text-base font-semibold text-gray-100">Categorias</h2>}

      <div className="flex gap-2">
        <SearchInput
          value={search}
          onChange={setSearch}
          placeholder="Filtrar categorias..."
          className="flex-1"
        />
        <button
          type="button"
          onClick={() => setBulkOpen(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-gray-800 border border-gray-700 hover:border-gray-600 text-gray-300 hover:text-gray-100 rounded-lg transition-colors shrink-0"
        >
          <Upload size={14} />
          Importar em massa
        </button>
      </div>

      {/* Add input */}
      <div className="flex items-center gap-2 px-3 py-2 border border-dashed border-gray-700 rounded-lg hover:border-gray-600 transition-colors">
        <Plus size={14} className="text-gray-500 shrink-0" />
        <input
          type="text"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleAdd()}
          placeholder="Adicionar nova categoria (Enter para salvar)"
          className="flex-1 text-sm bg-transparent text-gray-300 placeholder-gray-600 focus:outline-none"
        />
        <ToggleBillable value={newBillable} onChange={setNewBillable} />
      </div>

      {!loading && filtered.length > 0 && (
        <SelectionBar
          count={selection.count}
          allSelected={selection.allSelected}
          onToggleAll={selection.toggleAll}
          onDelete={() => void handleDeleteSelected()}
        />
      )}

      <div className="flex flex-col">
        {loading ? (
          <p className="text-sm text-gray-500 py-4 text-center">Carregando...</p>
        ) : filtered.length === 0 ? (
          <p className="text-sm text-gray-500 py-4 text-center">
            {search ? "Nenhuma categoria encontrada." : "Nenhuma categoria cadastrada."}
          </p>
        ) : (
          filtered.map((c) => (
            <CategoryCard
              key={c.id}
              category={c}
              selected={selection.isSelected(c.id)}
              onToggleSelect={selection.toggle}
              onUpdate={updateCategory}
              onDelete={deleteCategory}
            />
          ))
        )}
      </div>

      {bulkOpen && (
        <BulkImportModal
          title="Importar categorias em massa"
          placeholder={
            "Uma categoria por linha.\nPrefixo ! = non-billable.\nEx: Desenvolvimento\n!Reuniões"
          }
          onImport={bulkImportCategories}
          onClose={() => setBulkOpen(false)}
        />
      )}
    </div>
  );
}
