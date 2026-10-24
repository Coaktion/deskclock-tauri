import type { CustomField } from "@domain/entities/CustomField";
import type { CreateCustomFieldInput } from "@domain/usecases/customFields/CreateCustomField";
import type { UpdateCustomFieldInput } from "@domain/usecases/customFields/UpdateCustomField";
import {
  catalogFieldHomonym,
  catalogFieldLabel,
  mergedCatalogOptionLabels,
  missingCatalogOptions,
} from "@domain/usecases/monday/mondayCatalogFields";

// Os dois botões dos cards "Project Stage" e "Non Billable reason" da
// Importação de dados do Monday, fora do componente: a API local roda o mesmo
// clique (`docs-internal/specs/mcp.md` §7, Fase D3b). O toast fica no card.

export interface CatalogFieldActionDeps {
  /** Os campos personalizados como estão agora. */
  fields: CustomField[];
  createField(input: CreateCustomFieldInput): Promise<CustomField>;
  updateField(id: string, input: UpdateCustomFieldInput): Promise<void>;
  /** Grava o vínculo do campo com a coluna (a chave `monday*FieldId`). */
  link(fieldId: string): Promise<void>;
}

export interface CreatedCatalogField {
  field: CustomField;
  /** O nome procurado e, sem homônimo, o do campo criado — o do toast. */
  label: string;
  /** `true` quando um campo homônimo já existia e só foi vinculado. */
  reused: boolean;
}

/** "Criar do Monday": cria o campo com os rótulos do board, ou vincula o homônimo. */
export async function createOrLinkCatalogField(
  deps: CatalogFieldActionDeps,
  input: { title: string; defaultFieldLabel: string; optionLabels: string[] }
): Promise<CreatedCatalogField> {
  const label = catalogFieldLabel(input.defaultFieldLabel, input.title);
  const homonym = catalogFieldHomonym(deps.fields, label);
  const field =
    homonym ??
    (await deps.createField({ label, type: "select", optionLabels: input.optionLabels }));
  await deps.link(field.id);
  return { field, label, reused: homonym !== null };
}

/**
 * "Atualizar": traz os rótulos novos do board sem tocar nos antigos — o
 * `updateCustomField` casa as opções pelo rótulo e preserva o id. Devolve
 * quantas opções entraram.
 */
export async function refreshCatalogFieldOptions(
  deps: Pick<CatalogFieldActionDeps, "updateField">,
  field: CustomField,
  optionLabels: string[]
): Promise<number> {
  const added = missingCatalogOptions(field, optionLabels).length;
  await deps.updateField(field.id, {
    optionLabels: mergedCatalogOptionLabels(field, optionLabels),
  });
  return added;
}
