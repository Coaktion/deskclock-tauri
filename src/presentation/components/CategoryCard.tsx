import { useState, useRef } from "react";
import { Pencil, Trash2, Check, X, DollarSign } from "lucide-react";
import type { Category } from "@domain/entities/Category";
import type { UUID } from "@shared/types";

interface CategoryCardProps {
  category: Category;
  onUpdate: (id: UUID, name: string, defaultBillable: boolean) => Promise<void>;
  onDelete: (id: UUID) => void;
}

export function CategoryCard({ category, onUpdate, onDelete }: CategoryCardProps) {
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState(category.name);
  const [editBillable, setEditBillable] = useState(category.defaultBillable);
  const inputRef = useRef<HTMLInputElement>(null);

  function startEdit() {
    setEditName(category.name);
    setEditBillable(category.defaultBillable);
    setEditing(true);
    setTimeout(() => inputRef.current?.focus(), 0);
  }

  async function confirmEdit() {
    if (!editName.trim()) {
      cancelEdit();
      return;
    }
    await onUpdate(category.id, editName, editBillable);
    setEditing(false);
  }

  function cancelEdit() {
    setEditName(category.name);
    setEditBillable(category.defaultBillable);
    setEditing(false);
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter") confirmEdit();
    if (e.key === "Escape") cancelEdit();
  }

  return (
    <div className="flex items-center gap-2.5 px-3 py-2.5 rounded-lg hover:bg-gray-800/50 group transition-colors">
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
            onClick={() => setEditBillable((b) => !b)}
            title={editBillable ? "Billable" : "Non-billable"}
            className={`flex items-center gap-1 px-2 py-0.5 text-xs rounded-lg border transition-colors shrink-0 ${
              editBillable
                ? "bg-emerald-900/40 border-emerald-700 text-emerald-400"
                : "bg-gray-800 border-gray-700 text-gray-400"
            }`}
          >
            <DollarSign size={11} />
            {editBillable ? "Bill." : "Non."}
          </button>
          <button onClick={confirmEdit} className="p-1 text-green-400 hover:text-green-300 shrink-0">
            <Check size={13} />
          </button>
          <button onClick={cancelEdit} className="p-1 text-gray-500 hover:text-gray-300 shrink-0">
            <X size={13} />
          </button>
        </>
      ) : (
        <>
          <span className="flex-1 text-sm text-gray-100 truncate">{category.name}</span>
          <span
            className={`shrink-0 text-xs px-1.5 py-0.5 rounded-lg ${
              category.defaultBillable
                ? "bg-emerald-900/40 text-emerald-400"
                : "bg-gray-800 text-gray-500"
            }`}
          >
            {category.defaultBillable ? "Bill." : "Non."}
          </span>
          <div className="flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
            <button
              onClick={startEdit}
              title="Editar categoria"
              className="p-1 text-gray-500 hover:text-blue-400 rounded-lg"
            >
              <Pencil size={13} />
            </button>
            <button
              onClick={() => onDelete(category.id)}
              title="Excluir categoria"
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
