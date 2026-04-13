import { useState } from "react";
import { Plus } from "lucide-react";
import { useProjects } from "@presentation/hooks/useProjects";
import { SearchInput } from "./SearchInput";
import { BulkImportTextarea } from "./BulkImportTextarea";
import { ProjectCard } from "./ProjectCard";

interface ProjectsPanelProps {
  showTitle?: boolean;
}

export function ProjectsPanel({ showTitle = true }: ProjectsPanelProps) {
  const { projects, loading, createProject, bulkImportProjects, deleteProject } = useProjects();
  const [search, setSearch] = useState("");
  const [newName, setNewName] = useState("");
  const [bulkText, setBulkText] = useState("");
  const [bulkLoading, setBulkLoading] = useState(false);

  const filtered = projects.filter((p) => p.name.toLowerCase().includes(search.toLowerCase()));

  const handleAdd = async () => {
    if (!newName.trim()) return;
    try {
      await createProject(newName);
      setNewName("");
    } catch {
      // duplicata ou nome inválido — silencia, o usuário vê o estado não resetar
    }
  };

  const handleBulkImport = async () => {
    if (!bulkText.trim()) return;
    setBulkLoading(true);
    await bulkImportProjects(bulkText);
    setBulkText("");
    setBulkLoading(false);
  };

  return (
    <div className="flex flex-col gap-4">
      {showTitle && <h2 className="text-base font-semibold text-gray-100">Projetos</h2>}

      <BulkImportTextarea
        value={bulkText}
        onChange={setBulkText}
        placeholder={"Um projeto por linha.\nEx: Cliente A\nCliente B"}
        onImport={handleBulkImport}
        loading={bulkLoading}
      />

      <SearchInput value={search} onChange={setSearch} placeholder="Filtrar projetos..." />

      <div className="flex gap-2">
        <input
          type="text"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleAdd()}
          placeholder="Nome do projeto"
          className="flex-1 px-3 py-1.5 text-sm bg-gray-800 border border-gray-700 rounded-md text-gray-100 placeholder-gray-500 focus:outline-none focus:border-blue-500"
        />
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
            {search ? "Nenhum projeto encontrado." : "Nenhum projeto cadastrado."}
          </p>
        ) : (
          filtered.map((p) => <ProjectCard key={p.id} project={p} onDelete={deleteProject} />)
        )}
      </div>
    </div>
  );
}
