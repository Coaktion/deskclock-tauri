import type { IPlannedTaskRepository } from "@domain/repositories/IPlannedTaskRepository";
import type { PlannedTask, PlannedTaskAction, ScheduleType } from "@domain/entities/PlannedTask";
import { generateUUID } from "@shared/utils/uuid";
import type { UUID } from "@shared/types";

interface CreatePlannedTaskInput {
  name: string;
  projectId?: UUID | null;
  categoryId?: UUID | null;
  billable: boolean;
  scheduleType: ScheduleType;
  scheduleDate?: string | null;
  recurringDays?: number[] | null;
  periodStart?: string | null;
  periodEnd?: string | null;
  actions?: PlannedTaskAction[];
  sortOrder?: number;
}

export async function createPlannedTask(
  repo: IPlannedTaskRepository,
  input: CreatePlannedTaskInput,
  nowISO: string
): Promise<PlannedTask> {
  const task: PlannedTask = {
    id: generateUUID(),
    name: input.name,
    projectId: input.projectId ?? null,
    categoryId: input.categoryId ?? null,
    billable: input.billable,
    scheduleType: input.scheduleType,
    scheduleDate: input.scheduleDate ?? null,
    recurringDays: input.recurringDays ?? null,
    periodStart: input.periodStart ?? null,
    periodEnd: input.periodEnd ?? null,
    completedDates: [],
    actions: input.actions ?? [],
    sortOrder: input.sortOrder ?? 0,
    createdAt: nowISO,
  };
  await repo.save(task);
  return task;
}
