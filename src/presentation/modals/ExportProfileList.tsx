import { Star, Pencil, Trash2, Plus } from "lucide-react";
import { Button, IconButton } from "@presentation/components/ui";
import type { ExportProfile } from "@domain/entities/ExportProfile";

interface ExportProfileListProps {
  profiles: ExportProfile[];
  onNew: () => void;
  onEdit: (profile: ExportProfile) => void;
  onSetDefault: (id: string) => void;
  onRemove: (id: string) => void;
}

/** Aba Perfis do `ExportModal`. */
export function ExportProfileList({
  profiles,
  onNew,
  onEdit,
  onSetDefault,
  onRemove,
}: ExportProfileListProps) {
  return (
    <div className="flex flex-col gap-3">
      <Button variant="secondary" onClick={onNew} icon={<Plus size={14} />} className="w-full">
        Novo perfil
      </Button>
      {profiles.map((p) => (
        <div
          key={p.id}
          className="flex items-center gap-2 px-3 py-2 bg-raised rounded-control border border-border"
        >
          <div className="flex-1 min-w-0">
            <p className="text-sm text-fg truncate">{p.name}</p>
            <p className="text-xs text-fg-muted">{p.format.toUpperCase()}</p>
          </div>
          <div className="flex gap-1 shrink-0">
            <IconButton
              icon={<Star size={14} fill={p.isDefault ? "currentColor" : "none"} />}
              title="Definir padrão"
              onClick={() => onSetDefault(p.id)}
              className={p.isDefault ? "text-yellow-400" : "hover:text-yellow-400"}
            />
            <IconButton
              icon={<Pencil size={14} />}
              title="Editar perfil"
              onClick={() => onEdit(p)}
            />
            <IconButton
              icon={<Trash2 size={14} />}
              title="Excluir perfil"
              variant="danger"
              onClick={() => onRemove(p.id)}
              disabled={profiles.length <= 1}
            />
          </div>
        </div>
      ))}
    </div>
  );
}
