import type { CustomField, CustomValues } from "@domain/entities/CustomField";
import { serializeCustomValue } from "@domain/usecases/customFields/customValueCodec";
import { valueFor, type Findings } from "./findings";
import { matchCatalogItem } from "./matchCatalogItem";
import { parseCheckbox } from "./parseYesNo";
import type { TaskFieldHint, TaskTextCatalog, TaskTextFields } from "./types";

/** Valor gravável do campo, no formato do `customValueCodec`; `null` quando não há o que gravar. */
function resolveCustomValue(
  hint: TaskFieldHint,
  field: CustomField,
  query: string,
  findings: Findings
): string | null {
  if (field.type === "select") {
    const options = field.options.map((o) => ({ id: o.id, label: o.label }));
    return findings.record(hint, query, matchCatalogItem(query, options));
  }
  if (field.type === "checkbox") {
    const checked = parseCheckbox(query);
    if (checked === null) findings.missing(hint, query);
    return serializeCustomValue(field, checked === true) || null;
  }
  return serializeCustomValue(field, query) || null;
}

export function resolveCustomValues(
  parsed: TaskTextFields,
  hints: TaskFieldHint[],
  catalog: TaskTextCatalog,
  findings: Findings
): CustomValues {
  const fieldsById = new Map(catalog.customFields.map((f) => [f.id, f]));
  const values: CustomValues = {};
  for (const hint of hints) {
    const field = hint.fieldId ? fieldsById.get(hint.fieldId) : undefined;
    const query = valueFor(parsed, hint);
    if (!field || !query) continue;
    const value = resolveCustomValue(hint, field, query, findings);
    if (value) values[field.id] = value;
  }
  return values;
}
