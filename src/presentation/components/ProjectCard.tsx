import { useState, useRef } from "react";
import { Pencil, Trash2, Check, X } from "lucide-react";
import type { Project } from "@domain/entities/Project";
import type { UUID } from "@shared/types";
import { getProjectColor } from "@shared/utils/projectColor";

interface ProjectCardProps {
  project: Project;
  onUpdate: (id: UUID, name: string) => Promise<void>;
  onDelete: (id: UUID) => void;
}

export function ProjectCard({ project, onUpdate, onDelete }: ProjectCardProps) {
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState(project.name);
  const inputRef = useRef<HTMLInputElement>(null);
  const color = getProjectColor(project.id);

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
    <div className="flex items-center gap-2.5 px-3 py-2.5 rounded-lg hover:bg-gray-800/50 group transition-colors">
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
          <button onClick={confirmEdit} className="p-1 text-green-400 hover:text-green-300 shrink-0">
            <Check size={13} />
          </button>
          <button onClick={cancelEdit} className="p-1 text-gray-500 hover:text-gray-300 shrink-0">
            <X size={13} />
          </button>
        </>
      ) : (
        <>
          <span className="flex-1 text-sm text-gray-100 truncate">{project.name}</span>
          <div className="flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
            <button
              onClick={startEdit}
              title="Renomear projeto"
              className="p-1 text-gray-500 hover:text-blue-400 rounded-lg"
            >
              <Pencil size={13} />
            </button>
            <button
              onClick={() => onDelete(project.id)}
              title="Excluir projeto"
              className="p-1 text-gray-500 hover:text-red-400 rounded-lg"
            >
              <Trash2 size={13} />
            </button>
          </div>
        </>
      )}
    </div>
  );
}
