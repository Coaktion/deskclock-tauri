import type { PlannedTaskAction } from "@domain/entities/PlannedTask";
import { executeActions } from "@domain/utils/actions";
import { openInBrowser, openInFileManager } from "@shared/utils/shell";

/**
 * A ação quando ela é **a** ação. Com uma só, oferecer uma escolha entre uma
 * possibilidade é um clique cobrado por nada: quem a mostra — o ⚡ da barra de
 * título e a seção de ações do menu de linha — dispara direto.
 *
 * Mora aqui, e não dentro de quem a usa, porque é a regra que separa os dois
 * desenhos; enterrada no JSX ela só se verificaria abrindo a tela.
 */
export function singleAction(actions: PlannedTaskAction[]): PlannedTaskAction | null {
  return actions.length === 1 ? actions[0] : null;
}

/** Executar uma ação é sempre isto — a terceira grafia é que trouxe a função. */
export function runAction(action: PlannedTaskAction): void {
  void executeActions([action], { openUrl: openInBrowser, openPath: openInFileManager });
}
