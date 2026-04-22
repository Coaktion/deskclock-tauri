import type { UUID } from "@shared/types";

export type TaskStatus = "running" | "paused" | "completed";

export interface Task {
  id: UUID;
  name: string | null;
  projectId: UUID | null;
  categoryId: UUID | null;
  billable: boolean;
  startTime: string;
  endTime: string | null;
  durationSeconds: number | null;
  status: TaskStatus;
  createdAt: string;
  updatedAt: string;
}
