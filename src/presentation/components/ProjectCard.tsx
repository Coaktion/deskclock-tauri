import { useState, useRef } from "react";
import { Pencil, Trash2, Check, X, Tags } from "lucide-react";
import type { Category } from "@domain/entities/Category";
import type { Project } from "@domain/entities/Project";
import type { ProjectCategorySource } from "@domain/entities/ProjectCategory";
import type { UUID } from "@shared/types";
import { getProjectColor } from "@shared/utils/projectColor";
import { Input } from "@presentation/components/ui";
import { ProjectCategoriesEditor } from "./ProjectCategoriesEditor";

interface ProjectCardProps {
  project: Project;
  selected: boolean;
  onToggleSelect: (id: UUID) => void;
  onUpdate: (id: UUID, name: string) => Promise<void>;
  onDelete: (id: UUID) => void;
  /** Catálogo do workspace — o que o bloco de associação oferece. */
  categories: Category[];
  /** Associações deste projeto, por id de categoria. Vazio = oferece todas. */
  sourceById: Map<UUID, ProjectCategorySource>;
  onToggleCategory: (categoryId: UUID) => void;
  onClearCategories: () => void;
}

export function ProjectCard({
  project,
  selected,
  onToggleSelect,
  onUpdate,
  onDelete,
  categories,
  sourceById,
  onToggleCategory,
  onClearCategories,
}: ProjectCardProps) {
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState(project.name);
  const [showCategories, setShowCategories] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const color = getProjectColor(project);
  const associatedCount = sourceById.size;

  function startEdit() {
    setEditName(project.name);
    setEditing(true);
    setTimeout(() => inputRef.current?.focus(), 0);
  }

  async function confirmEdit() {
    if (!editName.trim() || editName.trim() === project.name) {
      cancelEdit();
      return;
    }
    await onUpdate(project.id, editName);
    setEditing(false);
  }

  function cancelEdit() {
    setEditName(project.name);
    setEditing(false);
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter") confirmEdit();
    if (e.key === "Escape") cancelEdit();
  }

  return (
    <div className="flex flex-col">
      <div
        onClick={editing ? undefined : () => onToggleSelect(project.id)}
        className={`flex items-center gap-2.5 px-3 py-2 rounded-control hover:bg-raised group transition-colors ${
          editing ? "" : "cursor-pointer"
        }`}
      >
        <input
          type="checkbox"
          checked={selected}
          onChange={() => onToggleSelect(project.id)}
          onClick={(e) => e.stopPropagation()}
          title="Selecionar projeto"
          className="shrink-0 accent-accent cursor-pointer"
        />
        <span className="shrink-0 w-2 h-2 rounded-full" style={{ backgroundColor: color }} />

        {editing ? (
          <>
            <Input
              ref={inputRef}
              variant="plain"
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              onKeyDown={handleKeyDown}
              className="flex-1 bg-raised border border-accent rounded-control px-2 py-0.5"
            />
            <button onClick={confirmEdit} className="p-1 text-billable hover:opacity-80 shrink-0">
              <Check size={14} />
            </button>
            <button onClick={cancelEdit} className="p-1 text-fg-muted hover:text-fg shrink-0">
              <X size={14} />
            </button>
          </>
        ) : (
          <>
            <span className="flex-1 text-sm text-fg truncate">{project.name}</span>
            {/* Fica sempre visível, ao contrário dos dois botões ao lado: carrega
              estado — quantas categorias o projeto oferece —, e esconder no
              hover esconderia a informação junto com o controle. */}
            <button
              onClick={(e) => {
                e.stopPropagation();
                setShowCategories((v) => !v);
              }}
              title={
                associatedCount === 0
                  ? "Sem associação: este projeto oferece todas as categorias"
                  : `${associatedCount} categoria(s) associada(s)`
              }
              className={`flex items-center gap-1 shrink-0 px-1.5 py-0.5 text-sm rounded-chip border transition-colors ${
                showCategories
                  ? "text-accent-text bg-accent/10 border-accent/40"
                  : associatedCount > 0
                    ? "text-fg-secondary bg-raised border-border hover:border-fg-muted"
                    : "text-fg-muted bg-raised/50 border-dashed border-border hover:border-fg-muted"
              }`}
            >
              <Tags size={14} className="shrink-0" />
              {associatedCount > 0 ? associatedCount : "todas"}
            </button>
            <div className="flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  startEdit();
                }}
                title="Renomear projeto"
                className="p-1 text-fg-muted hover:text-accent-text hover:bg-accent/10 rounded-control transition-colors"
              >
                <Pencil size={14} />
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onDelete(project.id);
                }}
                title="Excluir projeto"
                className="p-1 text-fg-muted hover:text-danger hover:bg-danger/10 rounded-control transition-colors"
              >
                <Trash2 size={14} />
              </button>
            </div>
          </>
        )}
      </div>

      {showCategories && !editing && (
        <div
          onClick={(e) => e.stopPropagation()}
          className="mx-3 mb-2 px-3 py-2 rounded-control bg-surface border border-border-subtle"
        >
          {/* O estado vazio precisa se explicar, ou parece que a associação se
              perdeu — é o estado de todo projeto até alguém marcar algo. */}
          <p className="text-xs text-fg-muted mb-1.5">
            {associatedCount === 0
              ? "Sem associação: este projeto oferece todas as categorias. Marque alguma para restringir."
              : "Só as marcadas aparecem no campo de categoria deste projeto."}
          </p>
          <ProjectCategoriesEditor
            categories={categories}
            sourceById={sourceById}
            onToggle={onToggleCategory}
            onClearAll={onClearCategories}
          />
        </div>
      )}
    </div>
  );
}
