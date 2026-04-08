import type { PlannedTask } from "@domain/entities/PlannedTask";
import type { UUID } from "@shared/types";

export interface IPlannedTaskRepository {
  save(task: PlannedTask): Promise<void>;
  update(task: PlannedTask): Promise<void>;
  findById(id: UUID): Promise<PlannedTask | null>;
  findForDate(dateISO: string): Promise<PlannedTask[]>;
  findForWeek(startISO: string, endISO: string): Promise<PlannedTask[]>;
  complete(id: UUID, dateISO: string): Promise<void>;
  uncomplete(id: UUID, dateISO: string): Promise<void>;
  reorder(ids: UUID[]): Promise<void>;
  delete(id: UUID): Promise<void>;
}
