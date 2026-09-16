import type { PlannedTask, PlannedTaskAction } from "@domain/entities/PlannedTask";
import type { Task } from "@domain/entities/Task";

/**
 * As planejadas por id, para quem resolve ação de muitas linhas por render: um
 * `find` por linha é quadrático numa lista que já chega a centenas.
 */
export type PlannedIndex = ReadonlyMap<string, PlannedTask>;

/**
 * Uma só referência para "nenhuma ação". Um `[]` literal por chamada é
 * identidade nova a cada render, e derruba o `useMemo`/`memo` de quem recebe.
 * Congelado porque é compartilhado: um `push` acidental apareceria em todas as
 * linhas de uma vez.
 */
const NO_ACTIONS: PlannedTaskAction[] = Object.freeze([]) as unknown as PlannedTaskAction[];

export function indexPlannedById(list: readonly PlannedTask[]): PlannedIndex {
  return new Map(list.map((planned) => [planned.id, planned]));
}

/**
 * As ações da planejada de origem, lidas **agora** — o app nunca copiou a ação
 * para a `Task`, então quem editou a planejada depois da execução vê a ação
 * nova, e a origem excluída não oferece nada.
 */
export function actionsOfPlanned(
  index: PlannedIndex,
  plannedTaskId: string | null | undefined
): PlannedTaskAction[] {
  if (!plannedTaskId) return NO_ACTIONS;
  const actions = index.get(plannedTaskId)?.actions;
  return actions && actions.length > 0 ? actions : NO_ACTIONS;
}

/**
 * As ações de uma linha que resume várias tarefas (o grupo). Decide a primeira
 * tarefa, na ordem dada, cuja planejada existe **e tem ações** — pular a que
 * aponta para planejada vazia é o que evita um grupo sem ⚡ só porque a
 * execução mais antiga veio de uma origem que depois perdeu as ações. Sem
 * nenhuma, `[]`: origem excluída não deixa rastro, pelo mesmo motivo do
 * `actionsOfPlanned`.
 */
export function actionsOfTasks(index: PlannedIndex, tasks: readonly Task[]): PlannedTaskAction[] {
  for (const task of tasks) {
    const actions = actionsOfPlanned(index, task.plannedTaskId);
    if (actions.length > 0) return actions;
  }
  return NO_ACTIONS;
}
