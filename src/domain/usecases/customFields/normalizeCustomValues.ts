import type { CustomField, CustomValues } from "@domain/entities/CustomField";
import { DomainError } from "@shared/errors";
import { deserializeCustomValue, serializeCustomValue } from "./customValueCodec";

const CHECKBOX_OFF = new Set(["", "false", "0", "não", "nao"]);

function normalizeSelect(field: CustomField, raw: string): string {
  const text = raw.trim();
  if (!text) return "";
  const stored = serializeCustomValue(field, text) || deserializeCustomValue(field, text);
  if (stored) return stored;
  const valid = field.options.map((o) => `'${o.label}'`).join(", ");
  throw new DomainError(
    `Valor '${raw}' inválido para o campo '${field.label}'. Opções válidas: ${valid} (rótulo ou id)`
  );
}

function normalizeCheckbox(field: CustomField, raw: string): string {
  const text = raw.trim().toLowerCase();
  if (CHECKBOX_OFF.has(text)) return "";
  const stored = serializeCustomValue(field, text) || deserializeCustomValue(field, text);
  if (stored) return stored;
  throw new DomainError(
    `Valor '${raw}' inválido para o campo '${field.label}' (${field.id}). Use 1, true ou Sim para marcar; vazio, false, 0 ou Não para desmarcar`
  );
}

function normalizeOne(field: CustomField, raw: string): string {
  if (field.type === "select") return normalizeSelect(field, raw);
  if (field.type === "checkbox") return normalizeCheckbox(field, raw);
  return serializeCustomValue(field, raw);
}

/**
 * Valida e normaliza os `customValues` que chegam de fora da UI (API local):
 * devolve o mesmo mapa que a UI gravaria, com a representação que
 * `taskGroupKey` compara. Valor vazio vira **ausência** (a chave é omitida).
 * Campo arquivado é aceito — os valores já gravados nele continuam valendo.
 */
export function normalizeCustomValues(
  input: Record<string, string>,
  fields: CustomField[]
): CustomValues {
  const byId = new Map(fields.map((f) => [f.id, f]));
  const result: CustomValues = {};
  for (const [id, raw] of Object.entries(input)) {
    const field = byId.get(id);
    if (!field) throw new DomainError(`Campo personalizado '${id}' não existe`);
    const value = normalizeOne(field, String(raw ?? ""));
    if (value) result[id] = value;
  }
  return result;
}
