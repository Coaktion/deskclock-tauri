import type { IPlannedTaskRepository } from "@domain/repositories/IPlannedTaskRepository";
import type { CustomValues } from "@domain/entities/CustomField";
import type { MondayItem } from "@shared/types/monday";
import type { UUID } from "@shared/types";
import { localDateISO } from "@shared/utils/time";
import { createPlannedTask } from "../plannedTasks/CreatePlannedTask";
import type { MondayItemPeriod } from "./mondayItemPeriod";

export interface ImportMondayItemInput {
  item: MondayItem;
  projectId: UUID | null;
  categoryId: UUID | null;
  billable: boolean;
  /** Da coluna Timeline do item; ausente quando ninguém a preencheu no board. */
  period: MondayItemPeriod | null;
  /**
   * Campos personalizados da planejada — na prática, o Project Stage. Ele é
   * custom field desde a Fase 4, mas o Monday exige a etapa no envio das horas:
   * deixar para preencher depois é garantir que ninguém preencha.
   */
  customValues?: CustomValues;
}

/**
 * Cria PlannedTasks a partir dos itens de trabalho selecionados no Monday.
 *
 * O agendamento vem da Timeline do item: um dia vira `specific_date`, vários
 * viram `period` — que é justamente o tipo de agendamento que existe para
 * trabalho espalhado por uma faixa de dias (§5.3). Item sem Timeline cai em
 * `specific_date` no dia corrente, para não nascer invisível no planejamento.
 */
export async function importMondayItems(
  repo: IPlannedTaskRepository,
  inputs: ImportMondayItemInput[],
  nowISO: string,
  workspaceId: UUID,
  addOpenUrlAction = false
): Promise<number> {
  if (inputs.length === 0) return 0;

  for (const { item, projectId, categoryId, billable, period, customValues } of inputs) {
    const isRange = period != null && period.startDayISO !== period.endDayISO;

    await createPlannedTask(
      repo,
      {
        workspaceId,
        name: item.name,
        projectId,
        categoryId,
        billable,
        scheduleType: isRange ? "period" : "specific_date",
        scheduleDate: isRange ? null : (period?.startDayISO ?? localDateISO(nowISO)),
        periodStart: isRange ? period.startDayISO : null,
        periodEnd: isRange ? period.endDayISO : null,
        actions: addOpenUrlAction && item.url ? [{ type: "open_url", value: item.url }] : [],
        customValues: customValues ?? {},
      },
      nowISO
    );
  }

  return inputs.length;
}
