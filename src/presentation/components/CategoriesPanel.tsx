import { useState } from "react";
import { Plus } from "lucide-react";
import { useCategories } from "@presentation/hooks/useCategories";
import { SearchInput } from "./SearchInput";
import { BulkImportTextarea } from "./BulkImportTextarea";
import { ToggleBillable } from "./ToggleBillable";
import { CategoryCard } from "./CategoryCard";

interface CategoriesPanelProps {
  showTitle?: boolean;
}

export function CategoriesPanel({ showTitle = true }: CategoriesPanelProps) {
  const { categories, loading, createCategory, bulkImportCategories, deleteCategory } =
    useCategories();
  const [search, setSearch] = useState("");
  const [newName, setNewName] = useState("");
  const [newBillable, setNewBillable] = useState(true);
  const [bulkText, setBulkText] = useState("");
  const [bulkLoading, setBulkLoading] = useState(false);

  const filtered = categories.filter((c) => c.name.toLowerCase().includes(search.toLowerCase()));

  const handleAdd = async () => {
    if (!newName.trim()) return;
    try {
      await createCategory(newName, newBillable);
      setNewName("");
    } catch {
      // duplicata ou nome inválido
    }
  };

  const handleBulkImport = async () => {
    if (!bulkText.trim()) return;
    setBulkLoading(true);
    await bulkImportCategories(bulkText);
    setBulkText("");
    setBulkLoading(false);
  };

  return (
    <div className="flex flex-col gap-4">
      {showTitle && <h2 className="text-base font-semibold text-gray-100">Categorias</h2>}

      <BulkImportTextarea
        value={bulkText}
        onChange={setBulkText}
        placeholder={
          "Uma categoria por linha.\nPrefixo ! = non-billable.\nEx: Desenvolvimento\n!Reuniões"
        }
        onImport={handleBulkImport}
        loading={bulkLoading}
      />

      <SearchInput value={search} onChange={setSearch} placeholder="Filtrar categorias..." />

      <div className="flex gap-2">
        <input
          type="text"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleAdd()}
          placeholder="Nome da categoria"
          className="flex-1 px-3 py-1.5 text-sm bg-gray-800 border border-gray-700 rounded-md text-gray-100 placeholder-gray-500 focus:outline-none focus:border-blue-500"
        />
        <ToggleBillable value={newBillable} onChange={setNewBillable} />
        <button
          type="button"
          onClick={handleAdd}
          disabled={!newName.trim()}
          className="flex items-center gap-1 px-3 py-1.5 text-sm bg-blue-600 hover:bg-blue-500 disabled:bg-gray-700 disabled:text-gray-500 text-white rounded-md transition-colors"
        >
          <Plus size={14} />
          Adicionar
        </button>
      </div>

      <div className="flex flex-col gap-1.5">
        {loading ? (
          <p className="text-sm text-gray-500 py-2">Carregando...</p>
        ) : filtered.length === 0 ? (
          <p className="text-sm text-gray-500 py-2">
            {search ? "Nenhuma categoria encontrada." : "Nenhuma categoria cadastrada."}
          </p>
        ) : (
          filtered.map((c) => <CategoryCard key={c.id} category={c} onDelete={deleteCategory} />)
        )}
      </div>
    </div>
  );
}
