import { useMemo, useState } from "react";
import { Plus, Upload } from "lucide-react";
import type { UseProjectsResult } from "@presentation/hooks/useProjects";
import { useMultiSelect } from "@presentation/hooks/useMultiSelect";
import { SearchInput } from "./SearchInput";
import { ProjectCard } from "./ProjectCard";
import { SelectionBar } from "./SelectionBar";
import { BulkImportModal } from "@presentation/modals/BulkImportModal";
import { fuzzyMatch } from "@shared/utils/fuzzySearch";

interface ProjectsPanelProps {
  showTitle?: boolean;
  /** Injetado pela página: o contador da aba lê a mesma instância do hook que a lista. */
  data: UseProjectsResult;
}

export function ProjectsPanel({ showTitle = true, data }: ProjectsPanelProps) {
  const {
    projects,
    loading,
    createProject,
    bulkImportProjects,
    updateProject,
    deleteProject,
    deleteProjects,
  } = data;
  const [search, setSearch] = useState("");
  const [newName, setNewName] = useState("");
  const [bulkOpen, setBulkOpen] = useState(false);

  const filtered = useMemo(
    () => projects.filter((p) => fuzzyMatch(search, p.name)),
    [projects, search]
  );
  const visibleIds = useMemo(() => filtered.map((p) => p.id), [filtered]);
  const selection = useMultiSelect(visibleIds);

  async function handleAdd() {
    if (!newName.trim()) return;
    try {
      await createProject(newName);
      setNewName("");
    } catch {
      // duplicata ou nome inválido — silencia
    }
  }

  async function handleDeleteSelected() {
    const ids = [...selection.selected];
    try {
      await deleteProjects(ids);
      selection.unselect(ids);
    } catch {
      // Falha na exclusão: a seleção fica de pé para o usuário tentar de novo.
    }
  }

  return (
    <div className="flex flex-col gap-3">
      {showTitle && <h2 className="text-base font-semibold text-gray-100">Projetos</h2>}

      <div className="flex gap-2">
        <SearchInput
          value={search}
          onChange={setSearch}
          placeholder="Filtrar projetos..."
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
          placeholder="Adicionar novo projeto (Enter para salvar)"
          className="flex-1 text-sm bg-transparent text-gray-300 placeholder-gray-600 focus:outline-none"
        />
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
            {search ? "Nenhum projeto encontrado." : "Nenhum projeto cadastrado."}
          </p>
        ) : (
          filtered.map((p) => (
            <ProjectCard
              key={p.id}
              project={p}
              selected={selection.isSelected(p.id)}
              onToggleSelect={selection.toggle}
              onUpdate={updateProject}
              onDelete={deleteProject}
            />
          ))
        )}
      </div>

      {bulkOpen && (
        <BulkImportModal
          title="Importar projetos em massa"
          placeholder={"Um projeto por linha.\nEx: Cliente A\nCliente B"}
          onImport={bulkImportProjects}
          onClose={() => setBulkOpen(false)}
        />
      )}
    </div>
  );
}
