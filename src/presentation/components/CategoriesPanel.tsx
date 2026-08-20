import { useMemo, useState } from "react";
import type { UseCategoriesResult } from "@presentation/hooks/useCategories";
import { useMultiSelect } from "@presentation/hooks/useMultiSelect";
import { useSubmitOnEnter } from "@presentation/hooks/useSubmitOnEnter";
import { AddRow, BillableChip, Input, SectionCard, SearchInput } from "@presentation/components/ui";
import { CategoryCard } from "./CategoryCard";
import { SelectAllBox, SelectionActions } from "./SelectionHeader";
import { fuzzyMatch } from "@shared/utils/fuzzySearch";

/** A caixa e o rótulo ficam em pontas opostas da faixa; é o `id` que os liga. */
const SELECT_ALL_ID = "selecionar-todas-categorias";

interface CategoriesPanelProps {
  /** Injetado pela página: o contador da aba lê a mesma instância do hook que a lista. */
  data: UseCategoriesResult;
}

export function CategoriesPanel({ data }: CategoriesPanelProps) {
  const { categories, loading, createCategory, updateCategory, deleteCategory, deleteCategories } =
    data;
  const [search, setSearch] = useState("");
  const [newName, setNewName] = useState("");
  const [newBillable, setNewBillable] = useState(true);

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
    <>
      <SearchInput
        value={search}
        onChange={setSearch}
        placeholder="Filtrar categorias..."
        className="shrink-0"
      />

      <SectionCard
        className="min-h-0 flex flex-col"
        bodyClassName="min-h-0 flex flex-col"
        title="Categorias"
        count={filtered.length}
        leading={
          <SelectAllBox
            id={SELECT_ALL_ID}
            allSelected={selection.allSelected}
            partial={selection.count > 0 && !selection.allSelected}
            onToggle={selection.toggleAll}
            title="Selecionar todas as categorias"
          />
        }
        action={
          <SelectionActions
            boxId={SELECT_ALL_ID}
            count={selection.count}
            onDelete={() => void handleDeleteSelected()}
          />
        }
      >
        <div className="min-h-0 overflow-y-auto divide-y divide-border-subtle">
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

        {/* O formulário é esta linha, não o painel: o campo de filtro acima é
            busca ao vivo e um Enter ali não deve cadastrar nada. */}
        <AddRow onKeyDown={handleAddKeyDown} className="shrink-0 border-t border-border-subtle">
          <Input
            variant="plain"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Adicionar nova categoria — Enter para salvar"
            className="flex-1"
          />
          <BillableChip billable={newBillable} onToggle={() => setNewBillable((b) => !b)} />
        </AddRow>
      </SectionCard>
    </>
  );
}
