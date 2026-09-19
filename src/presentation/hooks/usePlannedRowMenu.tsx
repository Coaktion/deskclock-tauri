import { Copy, Link, Pencil, Trash2 } from "lucide-react";
import type { PlannedTaskAction } from "@domain/entities/PlannedTask";
import { MENU_DIVIDER } from "@presentation/components/ui";
import { taskActionsMenuSection } from "@presentation/hooks/taskActionsMenuSection";
import { useRowMenu } from "@presentation/hooks/useRowMenu";

interface PlannedRowMenuActions {
  onEdit: () => void;
  onDuplicate: () => void;
  onCopyLink: () => void;
  onDelete: () => void;
  /** As ações da tarefa, que o menu lista no fim (H1). Sem elas, nada é somado. */
  actions?: PlannedTaskAction[];
  /** O modo de seleção: o menu fecha e não abre (ver `useRowMenu`). */
  disabled?: boolean;
}

/**
 * O menu da linha planejada: a configuração dela no `useRowMenu`. Os atalhos
 * dos itens são os mesmos que a linha focada aceita (`PLANNED_ROW_KEYS`); a
 * seção de ações não tem atalho, porque o que ela lista é dado do usuário.
 */
export function usePlannedRowMenu({
  onEdit,
  onDuplicate,
  onCopyLink,
  onDelete,
  actions = [],
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
      ...taskActionsMenuSection(actions),
    ],
    disabled,
  });
}
