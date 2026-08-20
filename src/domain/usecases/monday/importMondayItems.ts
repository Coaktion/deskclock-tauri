import type { IPlannedTaskRepository } from "@domain/repositories/IPlannedTaskRepository";
import type { CustomValues } from "@domain/entities/CustomField";
import type { PlannedTask } from "@domain/entities/PlannedTask";
import type { MondayItem } from "@shared/types/monday";
import type { UUID } from "@shared/types";
import { localDateISO } from "@shared/utils/time";
import { openUrlAction } from "@domain/utils/actions";
import { createPlannedTask } from "../plannedTasks/CreatePlannedTask";
import { periodToSchedule, type MondayItemPeriod } from "./mondayItemPeriod";

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
 * O agendamento vem da Timeline do item, pela regra de `periodToSchedule`.
 *
 * Devolve as planejadas criadas, na ordem das entradas: quem importa
 * automaticamente precisa do id para gravar o vínculo com o item do Monday.
 */
export async function importMondayItems(
  repo: IPlannedTaskRepository,
  inputs: ImportMondayItemInput[],
  nowISO: string,
  workspaceId: UUID,
  addOpenUrlAction = false
): Promise<PlannedTask[]> {
  const created: PlannedTask[] = [];

  for (const { item, projectId, categoryId, billable, period, customValues } of inputs) {
    // Mesmo construtor da Agenda: é ele que nomeia a ação pelo destino, e é o
    // que faz o chip dizer "Monday" em vez de repetir o nome do item, que a
    // planejada já leva.
    const action = addOpenUrlAction ? openUrlAction(item.url) : null;

    const task = await createPlannedTask(
      repo,
      {
        workspaceId,
        name: item.name,
        projectId,
        categoryId,
        billable,
        ...periodToSchedule(period, localDateISO(nowISO)),
        actions: action ? [action] : [],
        customValues: customValues ?? {},
      },
      nowISO
    );
    created.push(task);
  }

  return created;
}
