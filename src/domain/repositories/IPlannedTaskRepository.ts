import type { PlannedTask } from "@domain/entities/PlannedTask";
import type { UUID } from "@shared/types";

export interface IPlannedTaskRepository {
  save(task: PlannedTask): Promise<void>;
  update(task: PlannedTask): Promise<void>;
  findById(id: UUID): Promise<PlannedTask | null>;
  /** `workspaceId` omitido devolve as planejadas de TODOS os workspaces. */
  findForDate(dateISO: string, workspaceId?: UUID): Promise<PlannedTask[]>;
  /** `workspaceId` omitido devolve as planejadas de TODOS os workspaces. */
  findForWeek(startISO: string, endISO: string, workspaceId?: UUID): Promise<PlannedTask[]>;
  complete(id: UUID, dateISO: string): Promise<void>;
  uncomplete(id: UUID, dateISO: string): Promise<void>;
  reorder(ids: UUID[]): Promise<void>;
  delete(id: UUID): Promise<void>;
}
