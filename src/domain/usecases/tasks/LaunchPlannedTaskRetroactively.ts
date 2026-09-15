import type { PlannedTask } from "@domain/entities/PlannedTask";
import type { Task } from "@domain/entities/Task";
import type { IPlannedTaskRepository } from "@domain/repositories/IPlannedTaskRepository";
import type { ITaskRepository } from "@domain/repositories/ITaskRepository";
import { completePlannedTask } from "@domain/usecases/plannedTasks/CompletePlannedTask";
import { createRetroactiveTask } from "@domain/usecases/tasks/CreateRetroactiveTask";
import { addDaysISO, buildLocalISO } from "@shared/utils/time";

/** Instantes ISO já montados por quem chama — o formulário ou a API. */
export interface RetroactiveInterval {
  startTime: string;
  endTime: string;
}

function intervalFromPlanned(planned: PlannedTask, dateISO: string) {
  if (!planned.startTime || !planned.endTime) {
    throw new Error(`PlannedTask sem horário: ${planned.id}`);
  }
  const startISO = buildLocalISO(dateISO, planned.startTime);
  let endISO = buildLocalISO(dateISO, planned.endTime);
  // Fim menor ou igual ao início é evento que cruzou a meia-noite (§5.8).
  if (new Date(endISO) <= new Date(startISO)) {
    endISO = buildLocalISO(addDaysISO(dateISO, 1), planned.endTime);
  }
  return { startTime: startISO, endTime: endISO };
}

/**
 * Lança como registro do dia uma planejada e a marca como concluída naquele dia.
 *
 * Sem `interval`, o horário vem da planejada — hoje só as importadas do Google
 * Agenda (§5.8) o têm. Com `interval`, é o caso da planejada sem horário, em que
 * ela só fornece os dados e o intervalo vem de fora; aí vale o mínimo de 1
 * minuto do `createRetroactiveTask`. O horário da planejada nunca fica abaixo
 * dele: é HH:MM, e fim igual ao início vira o dia seguinte.
 *
 * Vive num use case, e não mais dentro da página, porque o botão de lançar
 * **todas** multiplica esta lógica por N: a montagem do instante local, a regra
 * de virada de meia-noite e a cópia dos campos personalizados passaram a valer
 * um teste. A tarefa nasce no workspace da planejada, como em `startPlannedTask`.
 */
export async function launchPlannedTaskRetroactively(
  taskRepo: ITaskRepository,
  plannedRepo: IPlannedTaskRepository,
  planned: PlannedTask,
  dateISO: string,
  nowISO: string,
  interval?: RetroactiveInterval
): Promise<Task> {
  const { startTime, endTime } = interval ?? intervalFromPlanned(planned, dateISO);
  const durationSeconds = Math.round(
    (new Date(endTime).getTime() - new Date(startTime).getTime()) / 1000
  );

  const task = await createRetroactiveTask(
    taskRepo,
    {
      workspaceId: planned.workspaceId,
      name: planned.name || null,
      projectId: planned.projectId,
      categoryId: planned.categoryId,
      billable: planned.billable,
      startTime,
      endTime,
      durationSeconds,
      // Copiados, nunca partilhados com a planejada — a mesma regra do
      // `startPlannedTask`. Ficavam de fora antes deste use case: a planejada do
      // Monday chegava sem o Project Stage que o envio de horas exige, e a
      // ausência ainda colapsava o agrupamento por chave (§6.3).
      customValues: { ...planned.customValues },
    },
    nowISO
  );

  await completePlannedTask(plannedRepo, planned.id, dateISO);
  return task;
}
