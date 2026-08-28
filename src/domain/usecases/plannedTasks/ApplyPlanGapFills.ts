import type { IPlannedTaskRepository } from "@domain/repositories/IPlannedTaskRepository";
import type { PlanGapFill } from "@domain/usecases/llm/FillPlanGaps";
import type { PlannedTask } from "@domain/entities/PlannedTask";
import { updatePlannedTask } from "./UpdatePlannedTask";

/**
 * Grava os preenchimentos revisados nas planejadas.
 *
 * **É aqui, e só aqui, que a proposta vira dado** — o `fillPlanGaps` lê e
 * propõe, como o `planWeek`. A diferença entre os dois é que este **altera**
 * tarefa existente, e por isso ele só escreve o que a proposta traz: os
 * `customValues` são mesclados sobre os que já existem, nunca substituídos. Um
 * `customValues` inteiro no lugar do antigo apagaria em silêncio o campo que o
 * usuário preencheu e que não estava em lacuna nenhuma.
 *
 * Devolve as atualizadas na ordem das entradas, como os imports.
 */
export async function applyPlanGapFills(
  repo: IPlannedTaskRepository,
  fills: PlanGapFill[]
): Promise<PlannedTask[]> {
  const updated: PlannedTask[] = [];
  for (const fill of fills) {
    const existing = await repo.findById(fill.taskId);
    if (!existing) continue;
    updated.push(
      await updatePlannedTask(repo, fill.taskId, {
        ...(fill.projectId ? { projectId: fill.projectId } : {}),
        ...(fill.categoryId ? { categoryId: fill.categoryId } : {}),
        customValues: { ...existing.customValues, ...fill.customValues },
      })
    );
  }
  return updated;
}
