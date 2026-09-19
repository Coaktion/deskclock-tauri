import { Pencil, Trash2 } from "lucide-react";
import { MENU_DIVIDER } from "@presentation/components/ui";
import { useRowMenu } from "@presentation/hooks/useRowMenu";

interface EntryRowMenuActions {
  onEdit: () => void;
  onDelete: () => void;
  /**
   * O modo de seleção das listas do Histórico e do Lançamento Manual (G5): lá a
   * linha inteira é alvo de marcar, e não há menu. Repassado ao `useRowMenu`,
   * que fecha o que estiver aberto — só esconder deixaria a âncora viva.
   */
  disabled?: boolean;
}

/**
 * O menu do lançamento — o das Entradas de hoje (`TaskCard`) e o das linhas do
 * Histórico e do Lançamento Manual (`DayEntryRow`), que têm o mesmo par de
 * ações. É a configuração dele no `useRowMenu`. Os atalhos são os que a linha
 * focada aceita (`ENTRY_ROW_KEYS` e `DAY_ENTRY_ROW_KEYS`).
 */
export function useEntryRowMenu({ onEdit, onDelete, disabled = false }: EntryRowMenuActions) {
  return useRowMenu({
    disabled,
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
