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
 * Ela abre o menu, e o divisor vem **depois** dela (decisão do usuário,
 * 2026-09-19): a ação é o que se faz com a tarefa, o resto é o que se faz com a
 * linha. Menu que fosse só ações fecharia com um divisor pendurado, e não
 * existe nenhum: a superfície que tem ação tem também edição.
 */
export function taskActionsMenuSection(actions: PlannedTaskAction[]): MenuEntry[] {
  if (actions.length === 0) return [];
  const only = singleAction(actions);
  return [
    only
      ? actionItem(only, `Abrir ${actionLabel(only)}`)
      : {
          label: "Ações",
          icon: <Zap size={14} />,
          children: actions.map((action) => actionItem(action, actionLabel(action))),
        },
    MENU_DIVIDER,
  ];
}
