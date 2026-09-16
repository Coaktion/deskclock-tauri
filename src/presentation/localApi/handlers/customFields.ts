import type { CustomField, CustomFieldType } from "@domain/entities/CustomField";
import { getCustomFields } from "@domain/usecases/customFields/GetCustomFields";
import { createCustomField } from "@domain/usecases/customFields/CreateCustomField";
import { updateCustomField } from "@domain/usecases/customFields/UpdateCustomField";
import { deleteCustomField } from "@domain/usecases/customFields/DeleteCustomField";
import { DomainError } from "@shared/errors";
import { NotFoundError } from "../errors";
import type { LocalApiDeps, LocalApiHandler } from "../types";

interface CreateBody {
  label: string;
  type: string;
  optionLabels?: string[] | null;
}

interface UpdateBody {
  label?: string | null;
  optionLabels?: string[] | null;
  archived?: boolean | null;
}

const FIELD_TYPES: CustomFieldType[] = ["text", "multiline", "select", "checkbox"];

function customFieldDto(f: CustomField) {
  return {
    id: f.id,
    label: f.label,
    type: f.type,
    options: f.options,
    sortOrder: f.sortOrder,
    archived: f.archived,
    createdAt: f.createdAt,
  };
}

function fieldType(value: string): CustomFieldType {
  if (!FIELD_TYPES.includes(value as CustomFieldType)) {
    throw new DomainError(`type inválido: '${value}'. Use ${FIELD_TYPES.join(", ")}`);
  }
  return value as CustomFieldType;
}

// O use case também acusa o campo inexistente, mas como `DomainError` — que
// sairia 400 em vez de 404.
async function findOrThrow(deps: LocalApiDeps, id: string | undefined): Promise<CustomField> {
  const field = id ? await deps.customFieldRepo.findById(id) : null;
  if (!field) throw new NotFoundError(`Campo personalizado '${id}' não encontrado`);
  return field;
}

export const listCustomFields: LocalApiHandler = async (deps) => ({
  status: 200,
  body: (await getCustomFields(deps.customFieldRepo)).map(customFieldDto),
});

export const createCustomFieldHandler: LocalApiHandler = async (deps, params) => {
  const body = params.body as CreateBody;
  const field = await createCustomField(
    deps.customFieldRepo,
    {
      label: body.label,
      type: fieldType(body.type),
      optionLabels: body.optionLabels ?? undefined,
    },
    deps.nowISO()
  );
  await deps.notifyCustomFieldsChanged();
  return { status: 201, body: customFieldDto(field) };
};

export const updateCustomFieldHandler: LocalApiHandler = async (deps, params) => {
  const existing = await findOrThrow(deps, params.id);
  const body = (params.body ?? {}) as UpdateBody;
  const updated = await updateCustomField(deps.customFieldRepo, existing.id, {
    label: body.label ?? undefined,
    optionLabels: body.optionLabels ?? undefined,
    archived: body.archived ?? undefined,
  });
  await deps.notifyCustomFieldsChanged();
  return { status: 200, body: customFieldDto(updated) };
};

export const deleteCustomFieldHandler: LocalApiHandler = async (deps, params) => {
  const existing = await findOrThrow(deps, params.id);
  await deleteCustomField(deps.customFieldRepo, existing.id);
  await deps.notifyCustomFieldsChanged();
  return { status: 204, body: null };
};
