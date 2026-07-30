import type { Task } from "@domain/entities/Task";

export interface TaskGroup {
  key: string;
  tasks: Task[];
  totalSeconds: number;
}

/**
 * Chave de agrupamento visual e de envio: nome + projeto + categoria (§6.3).
 * Exportada para que integrações idempotentes derivem a mesma chave a partir de
 * uma tarefa já unificada, sem reagrupar.
 */
export function taskGroupKey(task: Task): string {
  return `${task.name ?? ""}|${task.projectId ?? ""}|${task.categoryId ?? ""}`;
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
