import type { Task } from "@domain/entities/Task";

export interface TaskGroup {
  key: string;
  tasks: Task[];
  totalSeconds: number;
}

/**
 * Serializa os campos personalizados em ordem estável de id do campo. A ordem
 * das chaves de um objeto vem da ordem de inserção, que depende de como a
 * tarefa foi carregada — sem ordenar, a mesma tarefa produziria chaves
 * diferentes em telas diferentes.
 *
 * Valores vazios são descartados para que uma tarefa criada antes de o campo
 * existir continue agrupando com uma nova que o deixou em branco.
 */
function customPart(task: Task): string {
  return Object.entries(task.customValues ?? {})
    .filter(([, value]) => value !== "")
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([fieldId, value]) => `${fieldId}=${value}`)
    .join(",");
}

/**
 * Chave de agrupamento visual e de envio: nome + projeto + categoria + valores
 * personalizados (§6.3). Exportada para que integrações idempotentes derivem a
 * mesma chave a partir de uma tarefa já unificada, sem reagrupar.
 *
 * Os custom values entram na chave pelo mesmo motivo que `billable` entrou na
 * assinatura de `groupTasksForMonday`: sem eles, duas tarefas com Project Stage
 * diferente colapsam num item só e o valor enviado depende de qual chegou
 * primeiro.
 */
export function taskGroupKey(task: Task): string {
  return `${task.name ?? ""}|${task.projectId ?? ""}|${task.categoryId ?? ""}|${customPart(task)}`;
}

export function groupTasks(tasks: Task[]): TaskGroup[] {
  const map = new Map<string, TaskGroup>();

  for (const task of tasks) {
    const key = taskGroupKey(task);
    const existing = map.get(key);
    if (existing) {
      existing.tasks.push(task);
      existing.totalSeconds += task.durationSeconds ?? 0;
    } else {
      map.set(key, { key, tasks: [task], totalSeconds: task.durationSeconds ?? 0 });
    }
  }

  return Array.from(map.values());
}
