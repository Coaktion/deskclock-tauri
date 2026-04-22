import type { Task } from "@domain/entities/Task";
import type { UUID } from "@shared/types";

export interface ITaskRepository {
  save(task: Task): Promise<void>;
  update(task: Task): Promise<void>;
  findById(id: UUID): Promise<Task | null>;
  findByStatus(status: "running" | "paused"): Promise<Task[]>;
  findByDateRange(startISO: string, endISO: string): Promise<Task[]>;
  delete(id: UUID): Promise<void>;
  deleteMany(ids: UUID[]): Promise<void>;
}
