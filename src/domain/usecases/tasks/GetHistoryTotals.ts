import type { Task } from "@domain/entities/Task";

export interface HistoryTotals {
  totalSeconds: number;
  billableSeconds: number;
  nonBillableSeconds: number;
  count: number;
}

export function getHistoryTotals(tasks: Task[]): HistoryTotals {
  let totalSeconds = 0;
  let billableSeconds = 0;
  let nonBillableSeconds = 0;

  for (const t of tasks) {
    const s = t.durationSeconds ?? 0;
    totalSeconds += s;
    if (t.billable) billableSeconds += s;
    else nonBillableSeconds += s;
  }

  return { totalSeconds, billableSeconds, nonBillableSeconds, count: tasks.length };
}
