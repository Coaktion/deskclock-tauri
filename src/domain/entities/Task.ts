import type { UUID } from "@shared/types";
import type { CustomValues } from "@domain/entities/CustomField";

export type TaskStatus = "running" | "paused" | "completed";

export interface Task {
  id: UUID;
  workspaceId: UUID;
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
  /**
   * Campos personalizados, por id do campo. Obrigatório de propósito: é o que
   * faz o compilador apontar todo lugar que constrói uma Task sem decidir o que
   * fazer com os valores — e esquecer um deles significa colapsar grupos
   * silenciosamente em `taskGroupKey`.
   */
  customValues: CustomValues;
}
