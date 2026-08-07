import type { IPlannedTaskRepository } from "@domain/repositories/IPlannedTaskRepository";
import type { PlannedTask } from "@domain/entities/PlannedTask";
import type { CustomValues } from "@domain/entities/CustomField";
import type { UUID } from "@shared/types";

/** O que as telas mandam ao editar a tarefa em execução — ver `UpdateTask`. */
export interface RunningTaskEdit {
  name?: string | null;
  projectId?: UUID | null;
  categoryId?: UUID | null;
  billable?: boolean;
  startTime?: string;
  customValues?: CustomValues;
}

type PlannedTaskEdit = Partial<
  Pick<PlannedTask, "name" | "projectId" | "categoryId" | "billable" | "customValues">
>;

/**
 * Recorta da edição da tarefa em execução o que pertence à planejada de origem.
 *
 * A presença é testada por `in`, não por valor: `null` em projeto ou categoria é
 * uma escolha do usuário — "esta tarefa não tem projeto" — e precisa limpar o
 * campo na planejada, enquanto o campo ausente significa "não mexi nisso" e não
 * pode virar uma limpeza.
 *
 * `startTime` fica de fora: na tarefa ele é o instante em que a execução começou
 * e na planejada é o "HH:MM" que o import do Google Agenda preenche — corrigir o
 * relógio de uma execução não diz nada sobre o horário planejado.
 *
 * **Nome vazio não propaga.** `PlannedTask.name` é obrigatório (§4.2) e a linha
 * do planejamento não tem outro identificador; a tarefa em execução, essa sim,
 * pode ficar "(sem nome)". Apagar o nome de uma tarefa em andamento deixaria a
 * planejada sem nada a exibir — e, sendo recorrente, para sempre.
 */
export function toPlannedTaskEdit(input: RunningTaskEdit): PlannedTaskEdit {
  const edit: PlannedTaskEdit = {};
  if ("name" in input) {
    const name = input.name?.trim();
    if (name) edit.name = name;
  }
  if ("projectId" in input) edit.projectId = input.projectId ?? null;
  if ("categoryId" in input) edit.categoryId = input.categoryId ?? null;
  if ("billable" in input) edit.billable = input.billable;
  if ("customValues" in input && input.customValues) edit.customValues = input.customValues;
  return edit;
}

/**
 * Leva a edição da tarefa em execução de volta para a planejada que a originou,
 * para que a próxima ocorrência já nasça configurada. Numa recorrente, vale para
 * todos os dias seguintes — que é o ponto: a planejada é um molde único, sem
 * instância por dia.
 *
 * Devolve `null` sem escrever quando não há nada a aplicar ou quando a planejada
 * não existe mais. Ela pode ter sido apagada à mão ou pela poda do Monday com a
 * tarefa ainda rodando, e aí o vínculo aponta para o vazio: lançar por causa
 * disso faria uma edição que já foi gravada com sucesso na tarefa aparecer como
 * erro na tela.
 */
export async function applyRunningTaskEditToPlanned(
  repo: IPlannedTaskRepository,
  plannedTaskId: UUID,
  input: RunningTaskEdit
): Promise<PlannedTask | null> {
  const edit = toPlannedTaskEdit(input);
  if (Object.keys(edit).length === 0) return null;

  const existing = await repo.findById(plannedTaskId);
  if (!existing) return null;

  const updated: PlannedTask = { ...existing, ...edit };
  await repo.update(updated);
  return updated;
}
