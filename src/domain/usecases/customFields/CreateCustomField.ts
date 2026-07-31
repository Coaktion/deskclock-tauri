import type { ICustomFieldRepository } from "@domain/repositories/ICustomFieldRepository";
import type { CustomField, CustomFieldOption, CustomFieldType } from "@domain/entities/CustomField";
import { DomainError, DuplicateNameError } from "@shared/errors";
import { generateUUID } from "@shared/utils/uuid";

export interface CreateCustomFieldInput {
  label: string;
  type: CustomFieldType;
  /** Só para `select`; os labels viram opções com id gerado. */
  optionLabels?: string[];
}

export function buildOptions(labels: string[]): CustomFieldOption[] {
  const seen = new Set<string>();
  const options: CustomFieldOption[] = [];
  for (const raw of labels) {
    const label = raw.trim();
    if (!label || seen.has(label)) continue;
    seen.add(label);
    options.push({ id: generateUUID(), label });
  }
  return options;
}

export async function createCustomField(
  repository: ICustomFieldRepository,
  input: CreateCustomFieldInput,
  nowISO: string
): Promise<CustomField> {
  const label = input.label.trim();
  if (!label) throw new DomainError("O nome do campo não pode ser vazio.");

  const existing = await repository.findByLabel(label);
  if (existing) throw new DuplicateNameError(`Campo "${label}" já existe.`);

  const options = input.type === "select" ? buildOptions(input.optionLabels ?? []) : [];
  if (input.type === "select" && options.length === 0) {
    throw new DomainError("Um campo de seleção precisa de ao menos uma opção.");
  }

  const all = await repository.findAll();
  const field: CustomField = {
    id: generateUUID(),
    label,
    type: input.type,
    options,
    sortOrder: all.length,
    archived: false,
    createdAt: nowISO,
  };
  await repository.save(field);
  return field;
}
