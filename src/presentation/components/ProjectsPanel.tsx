import { useMemo, useState } from "react";
import { Plus, Upload } from "lucide-react";
import type { Category } from "@domain/entities/Category";
import type { ProjectCategorySource } from "@domain/entities/ProjectCategory";
import type { UseProjectsResult } from "@presentation/hooks/useProjects";
import { useMultiSelect } from "@presentation/hooks/useMultiSelect";
import { useProjectCategoryMap } from "@presentation/hooks/useProjectCategoryMap";
import { useSubmitOnEnter } from "@presentation/hooks/useSubmitOnEnter";
import { SectionCard, SearchInput } from "@presentation/components/ui";
import { ProjectCard } from "./ProjectCard";
import { SelectionBar } from "./SelectionBar";
import { BulkImportModal } from "@presentation/modals/BulkImportModal";
import { fuzzyMatch } from "@shared/utils/fuzzySearch";

/** Referência estável: um `new Map()` no JSX remontaria o bloco a cada render. */
const EMPTY_SOURCES: Map<string, ProjectCategorySource> = new Map();

interface ProjectsPanelProps {
  /** Injetado pela página: o contador da aba lê a mesma instância do hook que a lista. */
  data: UseProjectsResult;
  /** Catálogo do workspace, para associar categorias na linha do projeto. */
  categories: Category[];
}

export function ProjectsPanel({ data, categories }: ProjectsPanelProps) {
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
  const { rows: associations, setForProject } = useProjectCategoryMap();

  /** Associações por projeto, guardando a origem — é ela que marca as do Monday. */
  const sourceByProject = useMemo(() => {
    const byProject = new Map<string, Map<string, ProjectCategorySource>>();
    for (const a of associations) {
      const map = byProject.get(a.projectId) ?? new Map<string, ProjectCategorySource>();
      map.set(a.categoryId, a.source);
      byProject.set(a.projectId, map);
    }
    return byProject;
  }, [associations]);

  /**
   * Um clique grava a seleção inteira. O toggle é calculado aqui, e não no
   * componente da caixa, porque a fonte é `associations` — o estado local
   * divergiria a cada recarga vinda de outra janela.
   */
  async function handleToggleCategory(projectId: string, categoryId: string) {
    const current = sourceByProject.get(projectId) ?? new Map<string, ProjectCategorySource>();
    const next = new Set(current.keys());
    if (next.has(categoryId)) next.delete(categoryId);
    else next.add(categoryId);
    await setForProject(projectId, [...next]);
  }

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

  const handleAddKeyDown = useSubmitOnEnter(() => void handleAdd());

  return (
    <SectionCard title="Projetos" className="p-3 flex flex-col gap-3">
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
        <input
          type="text"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder="Adicionar novo projeto (Enter para salvar)"
          autoComplete="off"
          className="flex-1 text-sm bg-transparent text-fg placeholder-fg-muted focus:outline-none"
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
          <p className="text-sm text-fg-muted py-4 text-center">Carregando...</p>
        ) : filtered.length === 0 ? (
          <p className="text-sm text-fg-muted py-4 text-center">
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
              categories={categories}
              sourceById={sourceByProject.get(p.id) ?? EMPTY_SOURCES}
              onToggleCategory={(categoryId) => void handleToggleCategory(p.id, categoryId)}
              onClearCategories={() => void setForProject(p.id, [])}
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
    </SectionCard>
  );
}
