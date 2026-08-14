import { useState, useRef } from "react";
import { Pencil, Trash2, Check, X } from "lucide-react";
import type { Category } from "@domain/entities/Category";
import type { UUID } from "@shared/types";
import { BillableChip, IconButton, Input } from "@presentation/components/ui";
import { selectionBoxClass } from "./selectionStyles";

interface CategoryCardProps {
  category: Category;
  selected: boolean;
  onToggleSelect: (id: UUID) => void;
  onUpdate: (id: UUID, name: string, defaultBillable: boolean) => Promise<void>;
  onDelete: (id: UUID) => void;
}

export function CategoryCard({
  category,
  selected,
  onToggleSelect,
  onUpdate,
  onDelete,
}: CategoryCardProps) {
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
    <div
      onClick={editing ? undefined : () => onToggleSelect(category.id)}
      className={`flex items-center gap-2.5 px-3 py-2.5 hover:bg-surface group transition-colors ${
        editing ? "" : "cursor-pointer"
      }`}
    >
      <input
        type="checkbox"
        checked={selected}
        onChange={() => onToggleSelect(category.id)}
        onClick={(e) => e.stopPropagation()}
        title="Selecionar categoria"
        className={selectionBoxClass}
      />

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
          <BillableChip billable={editBillable} onToggle={() => setEditBillable((b) => !b)} />
          <IconButton
            onClick={() => void confirmEdit()}
            title="Salvar"
            icon={<Check size={14} />}
            size="sm"
          />
          <IconButton
            onClick={cancelEdit}
            title="Cancelar"
            icon={<X size={14} />}
            variant="neutral"
            size="sm"
          />
        </>
      ) : (
        <>
          <span className="flex-1 text-sm text-fg truncate">{category.name}</span>
          {/* Grava na hora, sem passar pelo modo de edição: o chip é o controle
              do faturamento em toda parte, e aqui o que ele governa é o padrão
              das tarefas futuras (§6.2), não as já lançadas. */}
          <BillableChip
            billable={category.defaultBillable}
            onToggle={() => void onUpdate(category.id, category.name, !category.defaultBillable)}
          />
          <div
            onClick={(e) => e.stopPropagation()}
            className="flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
          >
            <IconButton
              onClick={startEdit}
              title="Editar categoria"
              icon={<Pencil size={14} />}
              size="sm"
            />
            <IconButton
              onClick={() => onDelete(category.id)}
              title="Excluir categoria"
              icon={<Trash2 size={14} />}
              variant="danger"
              size="sm"
            />
          </div>
        </>
      )}
    </div>
  );
}
