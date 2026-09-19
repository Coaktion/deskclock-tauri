import { Copy, Link, Pencil, Trash2 } from "lucide-react";
import { MENU_DIVIDER } from "@presentation/components/ui";
import { useRowMenu } from "@presentation/hooks/useRowMenu";

interface PlannedRowMenuActions {
  onEdit: () => void;
  onDuplicate: () => void;
  onCopyLink: () => void;
  onDelete: () => void;
  /** O modo de seleção: o menu fecha e não abre (ver `useRowMenu`). */
  disabled?: boolean;
}

/**
 * O menu da linha planejada: a configuração dela no `useRowMenu`. Os atalhos
 * dos itens são os mesmos que a linha focada aceita (`PLANNED_ROW_KEYS`).
 */
export function usePlannedRowMenu({
  onEdit,
  onDuplicate,
  onCopyLink,
  onDelete,
  disabled = false,
}: PlannedRowMenuActions) {
  return useRowMenu({
    items: [
      { label: "Editar", icon: <Pencil size={14} />, shortcut: "E", onSelect: onEdit },
      { label: "Duplicar", icon: <Copy size={14} />, shortcut: "D", onSelect: onDuplicate },
      { label: "Copiar link", icon: <Link size={14} />, shortcut: "L", onSelect: onCopyLink },
      MENU_DIVIDER,
      {
        label: "Excluir",
        icon: <Trash2 size={14} />,
        shortcut: "Del",
        tone: "danger",
        onSelect: onDelete,
      },
    ],
    disabled,
  });
}
