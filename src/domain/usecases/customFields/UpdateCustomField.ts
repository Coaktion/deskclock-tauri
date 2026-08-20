import type { ICustomFieldRepository } from "@domain/repositories/ICustomFieldRepository";
import type { CustomField, CustomFieldOption } from "@domain/entities/CustomField";
import { DomainError, DuplicateNameError } from "@shared/errors";
import { generateUUID } from "@shared/utils/uuid";
import type { UUID } from "@shared/types";

export interface UpdateCustomFieldInput {
  label?: string;
  /** Labels na ordem final. Os já existentes são casados pelo id para não perder valor. */
  optionLabels?: string[];
  archived?: boolean;
}

/**
 * Reconstrói as opções preservando os ids das que continuam existindo. Trocar o
 * id de uma opção apagaria o valor de toda tarefa que a usa — o valor gravado
 * **é** o id.
 */
function mergeOptions(current: CustomFieldOption[], labels: string[]): CustomFieldOption[] {
  const byLabel = new Map(current.map((o) => [o.label, o]));
  const seen = new Set<string>();
  const options: CustomFieldOption[] = [];
  for (const raw of labels) {
    const label = raw.trim();
    if (!label || seen.has(label)) continue;
    seen.add(label);
    options.push(byLabel.get(label) ?? { id: generateUUID(), label });
  }
  return options;
}

export async function updateCustomField(
  repository: ICustomFieldRepository,
  id: UUID,
  input: UpdateCustomFieldInput
): Promise<CustomField> {
  const field = await repository.findById(id);
  if (!field) throw new DomainError("Campo personalizado não encontrado.");

  const label = input.label === undefined ? field.label : input.label.trim();
  if (!label) throw new DomainError("O nome do campo não pode ser vazio.");
  if (label !== field.label) {
    const existing = await repository.findByLabel(label);
    if (existing) throw new DuplicateNameError(`Campo "${label}" já existe.`);
  }

  let options = field.options;
  if (input.optionLabels !== undefined && field.type === "select") {
    options = mergeOptions(field.options, input.optionLabels);
    if (options.length === 0) {
      throw new DomainError("Um campo de seleção precisa de ao menos uma opção.");
    }
  }

  const updated: CustomField = {
    ...field,
    label,
    options,
    archived: input.archived ?? field.archived,
  };
  await repository.update(updated);
  return updated;
}
