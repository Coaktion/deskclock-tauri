import { Pencil, Trash2 } from "lucide-react";
import { MENU_DIVIDER } from "@presentation/components/ui";
import { useRowMenu } from "@presentation/hooks/useRowMenu";

interface EntryRowMenuActions {
  onEdit: () => void;
  onDelete: () => void;
}

/**
 * O menu do lançamento (`TaskCard`): a configuração dele no `useRowMenu`. Os
 * atalhos são os que a linha focada aceita (`ENTRY_ROW_KEYS`).
 */
export function useEntryRowMenu({ onEdit, onDelete }: EntryRowMenuActions) {
  return useRowMenu({
    items: [
      { label: "Editar", icon: <Pencil size={14} />, shortcut: "E", onSelect: onEdit },
      MENU_DIVIDER,
      {
        label: "Excluir",
        icon: <Trash2 size={14} />,
        shortcut: "Del",
        tone: "danger",
        onSelect: onDelete,
      },
    ],
  });
}
