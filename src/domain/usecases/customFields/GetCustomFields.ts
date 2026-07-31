import type { ICustomFieldRepository } from "@domain/repositories/ICustomFieldRepository";
import type { CustomField } from "@domain/entities/CustomField";

export async function getCustomFields(repository: ICustomFieldRepository): Promise<CustomField[]> {
  return repository.findAll();
}

/** Os campos que os formulários oferecem: todos menos os arquivados. */
export function activeCustomFields(fields: CustomField[]): CustomField[] {
  return fields.filter((f) => !f.archived);
}
