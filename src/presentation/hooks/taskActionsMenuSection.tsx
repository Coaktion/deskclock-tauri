import { FolderOpen, Globe, Zap } from "lucide-react";

import type { PlannedTaskAction } from "@domain/entities/PlannedTask";
import { actionLabel } from "@presentation/components/ActionChip";
import { runAction, singleAction } from "@presentation/components/taskActions";
import { MENU_DIVIDER, type MenuEntry, type MenuItem } from "@presentation/components/ui";

function actionItem(action: PlannedTaskAction, label: string): MenuItem {
  return {
    label,
    icon: action.type === "open_url" ? <Globe size={14} /> : <FolderOpen size={14} />,
    onSelect: () => runAction(action),
  };
}

/**
 * A seção de ações do menu de linha (H1): as `PlannedTaskAction` da tarefa, que
 * antes moravam no ⚡ da própria linha. O desenho segue o do ⚡ — **uma ação é o
 * item**, clicável direto, e é a partir de duas que há escolha a oferecer —, só
 * que a escolha agora é um submenu em vez de um painel.
 *
 * O divisor vem junto porque a seção é sempre a **última** de um menu que já tem
 * itens (Editar, Excluir…). Menu que fosse só ações abriria com um divisor no
 * topo, e não existe nenhum: a superfície que tem ação tem também edição.
 */
export function taskActionsMenuSection(actions: PlannedTaskAction[]): MenuEntry[] {
  if (actions.length === 0) return [];
  const only = singleAction(actions);
  return [
    MENU_DIVIDER,
    only
      ? actionItem(only, `Abrir ${actionLabel(only)}`)
      : {
          label: "Ações",
          icon: <Zap size={14} />,
          children: actions.map((action) => actionItem(action, actionLabel(action))),
        },
  ];
}
