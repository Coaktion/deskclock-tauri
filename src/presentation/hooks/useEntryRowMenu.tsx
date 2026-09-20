import { Pencil, Trash2 } from "lucide-react";
import type { PlannedTaskAction } from "@domain/entities/PlannedTask";
import { MENU_DIVIDER } from "@presentation/components/ui";
import { taskActionsMenuSection } from "@presentation/hooks/taskActionsMenuSection";
import { useRowMenu } from "@presentation/hooks/useRowMenu";

interface EntryRowMenuActions {
  onEdit: () => void;
  onDelete: () => void;
  /**
   * As ações da planejada que originou o lançamento, listadas no topo do menu
   * (H1). O Histórico as tem; o Lançamento Manual, que não as busca, não passa
   * nada e o menu fica com o par de sempre.
   */
  actions?: PlannedTaskAction[];
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
export function useEntryRowMenu({
  onEdit,
  onDelete,
  actions = [],
  disabled = false,
}: EntryRowMenuActions) {
  return useRowMenu({
    disabled,
    items: [
      ...taskActionsMenuSection(actions),
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
