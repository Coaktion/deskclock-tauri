import { useState, useRef } from "react";
import { Pencil, Trash2, Check, X, Tags } from "lucide-react";
import type { Category } from "@domain/entities/Category";
import type { Project } from "@domain/entities/Project";
import type { ProjectCategorySource } from "@domain/entities/ProjectCategory";
import type { UUID } from "@shared/types";
import { getProjectColor } from "@shared/utils/projectColor";
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
}: ProjectCardProps) {
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState(project.name);
  const [showCategories, setShowCategories] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const color = getProjectColor(project.id);
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
        className={`flex items-center gap-2.5 px-3 py-2.5 rounded-lg hover:bg-gray-800/50 group transition-colors ${
          editing ? "" : "cursor-pointer"
        }`}
      >
        <input
          type="checkbox"
          checked={selected}
          onChange={() => onToggleSelect(project.id)}
          onClick={(e) => e.stopPropagation()}
          title="Selecionar projeto"
          className="shrink-0 accent-blue-500 cursor-pointer"
        />
        <span className="shrink-0 w-2 h-2 rounded-full" style={{ backgroundColor: color }} />

        {editing ? (
          <>
            <input
              ref={inputRef}
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              onKeyDown={handleKeyDown}
              className="flex-1 text-sm bg-gray-800 border border-blue-500 rounded-lg px-2 py-0.5 text-gray-100 focus:outline-none"
            />
            <button
              onClick={confirmEdit}
              className="p-1 text-green-400 hover:text-green-300 shrink-0"
            >
              <Check size={13} />
            </button>
            <button onClick={cancelEdit} className="p-1 text-gray-500 hover:text-gray-300 shrink-0">
              <X size={13} />
            </button>
          </>
        ) : (
          <>
            <span className="flex-1 text-sm text-gray-100 truncate">{project.name}</span>
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
              className={`flex items-center gap-1 shrink-0 px-1.5 py-0.5 text-[11px] rounded-lg border transition-colors ${
                showCategories
                  ? "text-blue-400 bg-blue-500/10 border-blue-500/40"
                  : associatedCount > 0
                    ? "text-gray-300 bg-gray-800 border-gray-700 hover:border-gray-500"
                    : "text-gray-600 bg-gray-800/50 border-dashed border-gray-700/50 hover:border-gray-600"
              }`}
            >
              <Tags size={11} className="shrink-0" />
              {associatedCount > 0 ? associatedCount : "todas"}
            </button>
            <div className="flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  startEdit();
                }}
                title="Renomear projeto"
                className="p-1 text-gray-500 hover:text-blue-400 rounded-lg"
              >
                <Pencil size={13} />
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onDelete(project.id);
                }}
                title="Excluir projeto"
                className="p-1 text-gray-500 hover:text-red-400 rounded-lg"
              >
                <Trash2 size={13} />
              </button>
            </div>
          </>
        )}
      </div>

      {showCategories && !editing && (
        <div
          onClick={(e) => e.stopPropagation()}
          className="mx-3 mb-2 px-3 py-2 rounded-lg bg-gray-900 border border-gray-800"
        >
          {/* O estado vazio precisa se explicar, ou parece que a associação se
              perdeu — é o estado de todo projeto até alguém marcar algo. */}
          <p className="text-[11px] text-gray-500 mb-1.5">
            {associatedCount === 0
              ? "Sem associação: este projeto oferece todas as categorias. Marque alguma para restringir."
              : "Só as marcadas aparecem no campo de categoria deste projeto."}
          </p>
          <ProjectCategoriesEditor
            categories={categories}
            sourceById={sourceById}
            onToggle={onToggleCategory}
          />
        </div>
      )}
    </div>
  );
}
