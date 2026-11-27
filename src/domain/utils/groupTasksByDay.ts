import type { Task } from "@domain/entities/Task";
import { groupTasks, type TaskGroup } from "@domain/utils/groupTasks";
import { localDateISO } from "@shared/utils/time";

export interface DayGroup {
  date: string;
  groups: TaskGroup[];
}

/** Agrupa por dia local (§6.6) e, dentro do dia, pela chave de agrupamento (§6.3). Dia mais recente primeiro. */
export function groupTasksByDay(tasks: Task[]): DayGroup[] {
  const byDate = new Map<string, Task[]>();
  for (const task of tasks) {
    const date = localDateISO(task.startTime);
    const list = byDate.get(date) ?? [];
    list.push(task);
    byDate.set(date, list);
  }
  return [...byDate.entries()]
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([date, dayTasks]) => ({ date, groups: groupTasks(dayTasks) }));
}
