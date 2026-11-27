import type { CustomValues } from "@domain/entities/CustomField";
import type { PlannedTask } from "@domain/entities/PlannedTask";
import type { IPlannedTaskRepository } from "@domain/repositories/IPlannedTaskRepository";
import type { UUID } from "@shared/types";
import { createPlannedTask } from "./CreatePlannedTask";

/** O que o "Adicionar como planejada" da tarefa recebida por link grava. */
export interface SharedTaskPlan {
  workspaceId: UUID;
  name: string;
  projectId: UUID | null;
  categoryId: UUID | null;
  billable: boolean;
  customValues: CustomValues;
  /** YYYY-MM-DD. O link não traz data: quem recebe escolhe. */
  date: string;
  /** `""` = sem horário. */
  startTime: string;
  endTime: string;
}

/**
 * A tarefa que chegou por link vira sempre `specific_date`: recorrência é o
 * modo de trabalho de quem recebe, e o contrato não a carrega
 * (`docs-internal/specs/compartilhar-tarefa.md`).
 */
export function planSharedTask(
  repo: IPlannedTaskRepository,
  plan: SharedTaskPlan,
  nowISO: string
): Promise<PlannedTask> {
  return createPlannedTask(
    repo,
    {
      workspaceId: plan.workspaceId,
      name: plan.name,
      projectId: plan.projectId,
      categoryId: plan.categoryId,
      billable: plan.billable,
      customValues: plan.customValues,
      scheduleType: "specific_date",
      scheduleDate: plan.date,
      startTime: plan.startTime || undefined,
      endTime: plan.endTime || undefined,
    },
    nowISO
  );
}
