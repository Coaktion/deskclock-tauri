import type { PlannedTask } from "@domain/entities/PlannedTask";
import type { CustomField } from "@domain/entities/CustomField";
import type { Project } from "@domain/entities/Project";
import type { Category } from "@domain/entities/Category";
import { formatCustomValue } from "@domain/usecases/customFields/customValueCodec";
import type { SharedTaskPayload } from "@shared/utils/shareLink";

/**
 * Traduz a planejada para o payload do deeplink (`shared/utils/shareLink.ts`).
 *
 * O que atravessa é **nome**, nunca id: projeto e categoria viajam pelo nome do
 * catálogo, e campo personalizado pelo **rótulo** — o id é local de cada banco.
 * Agendamento, recorrência, período, ações, `completedDates`, `sortOrder`, ids e
 * workspace ficam de fora do contrato e por isso não são lidos aqui.
 *
 * O valor de cada campo passa por `formatCustomValue`, que é o lugar único onde
 * o app traduz valor gravado em texto legível — inclusive o id da opção de um
 * `select` para o rótulo dela. Um par que não resolve (campo apagado, opção que
 * não existe mais, valor vazio) é **descartado**: mandar o id cru faria o outro
 * lado gravar um texto que não é o rótulo de nada.
 */
export function plannedTaskToSharePayload(
  task: PlannedTask,
  projects: Project[],
  categories: Category[],
  customFields: CustomField[]
): SharedTaskPayload {
  const fieldsById = new Map(customFields.map((field) => [field.id, field]));
  const customValues: Record<string, string> = {};

  for (const [fieldId, raw] of Object.entries(task.customValues ?? {})) {
    // Valor vazio é a **ausência** de valor, inclusive no checkbox desmarcado
    // (`customValueCodec`): formatado, ele viraria um "Não" que a tarefa nunca
    // disse.
    const stored = (raw ?? "").trim();
    if (!stored) continue;
    const field = fieldsById.get(fieldId);
    if (!field) continue;
    const label = field.label.trim();
    if (!label) continue;
    const value = formatCustomValue(field, stored).trim();
    if (!value) continue;
    customValues[label] = value;
  }

  return {
    name: task.name,
    projectName: projects.find((p) => p.id === task.projectId)?.name,
    categoryName: categories.find((c) => c.id === task.categoryId)?.name,
    billable: task.billable,
    startTime: task.startTime,
    endTime: task.endTime,
    customValues,
  };
}
