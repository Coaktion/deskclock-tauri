import { isIntegerInRange, type NumberRange } from "@domain/usecases/settings/settingsRules";
import { DomainError } from "@shared/errors";

// Validação dos PATCH de configuração por grupo (Fases D3a e D3b): cada chave
// tem a sua regra, e o corpo vira patch tipado. Compartilhada pelas abas das
// Configurações e pelos ajustes das integrações.

export type Validator = (value: unknown, key: string) => string | null;

export const boolean: Validator = (value, key) =>
  typeof value === "boolean" ? null : `${key} deve ser true ou false.`;

export const text: Validator = (value, key) =>
  typeof value === "string" ? null : `${key} deve ser texto.`;

export const integerIn =
  (range: NumberRange, unit: string): Validator =>
  (value, key) =>
    isIntegerInRange(value, range)
      ? null
      : `${key} deve ser um inteiro de ${range.min} a ${range.max}${unit}.`;

export const oneOf =
  (options: readonly (string | number)[]): Validator =>
  (value, key) =>
    options.includes(value as string | number)
      ? null
      : `${key} deve ser um de: ${options.join(", ")}.`;

/**
 * O corpo como patch tipado. Chave fora do grupo é 400 em vez de ignorada: um
 * erro de digitação passaria por "gravado" sem gravar nada — e é assim que as
 * chaves órfãs (`fontSize`, `overlayShowOnStart`) ficam de fora.
 */
export function parsePatch<T>(
  body: unknown,
  rules: Record<string, Validator>,
  group: string
): Partial<T> {
  if (body === null || body === undefined) return {};
  if (typeof body !== "object" || Array.isArray(body)) {
    throw new DomainError("O corpo deve ser um objeto JSON.");
  }
  const patch: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(body)) {
    // Só chave própria: `constructor`, `__proto__` e `toString` não são regras.
    // (`Object.hasOwn` pede lib ES2022; o tsconfig está em ES2021.)
    const rule = Object.prototype.hasOwnProperty.call(rules, key) ? rules[key] : undefined;
    if (!rule) {
      throw new DomainError(
        `Configuração desconhecida em ${group}: '${key}'. Válidas: ${Object.keys(rules).join(", ")}.`
      );
    }
    if (value === undefined) continue;
    if (value === null) throw new DomainError(`${key} não aceita null; omita para manter.`);
    const error = rule(value, key);
    if (error) throw new DomainError(error);
    patch[key] = value;
  }
  return patch as Partial<T>;
}
