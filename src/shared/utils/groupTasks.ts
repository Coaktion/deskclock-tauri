import type { Task } from "@domain/entities/Task";

export interface TaskGroup {
  key: string;
  tasks: Task[];
  totalSeconds: number;
}

export function groupTasks(tasks: Task[]): TaskGroup[] {
  const map = new Map<string, TaskGroup>();

  for (const task of tasks) {
    const key = `${task.name ?? ""}|${task.projectId ?? ""}|${task.categoryId ?? ""}`;
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
