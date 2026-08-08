import { useMemo, useState } from "react";
import { Plus, Upload } from "lucide-react";
import type { UseCategoriesResult } from "@presentation/hooks/useCategories";
import { useMultiSelect } from "@presentation/hooks/useMultiSelect";
import { useSubmitOnEnter } from "@presentation/hooks/useSubmitOnEnter";
import { Input, SectionCard, SearchInput } from "@presentation/components/ui";
import { ToggleBillable } from "./ToggleBillable";
import { CategoryCard } from "./CategoryCard";
import { SelectionBar } from "./SelectionBar";
import { BulkImportModal } from "@presentation/modals/BulkImportModal";
import { fuzzyMatch } from "@shared/utils/fuzzySearch";

interface CategoriesPanelProps {
  /** Injetado pela página: o contador da aba lê a mesma instância do hook que a lista. */
  data: UseCategoriesResult;
}

export function CategoriesPanel({ data }: CategoriesPanelProps) {
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

  const handleAddKeyDown = useSubmitOnEnter(() => void handleAdd());

  return (
    <SectionCard title="Categorias" className="p-3 flex flex-col gap-3">
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
          className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-raised border border-border hover:border-fg-muted text-fg-secondary hover:text-fg rounded-control transition-colors shrink-0"
        >
          <Upload size={14} />
          Importar em massa
        </button>
      </div>

      {/* Add input — o formulário é esta linha, não o painel: o campo de filtro
          acima é busca ao vivo e um Enter ali não deve cadastrar nada. */}
      <div
        onKeyDown={handleAddKeyDown}
        className="flex items-center gap-2 px-3 py-2 border border-dashed border-border rounded-control hover:border-fg-muted transition-colors"
      >
        <Plus size={14} className="text-fg-muted shrink-0" />
        <Input
          variant="plain"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder="Adicionar nova categoria (Enter para salvar)"
          className="flex-1"
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
          <p className="text-sm text-fg-muted py-4 text-center">Carregando...</p>
        ) : filtered.length === 0 ? (
          <p className="text-sm text-fg-muted py-4 text-center">
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
    </SectionCard>
  );
}
