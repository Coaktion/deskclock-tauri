import type { CustomField, CustomValues } from "@domain/entities/CustomField";

/**
 * Quantos dos campos ativos têm valor. É o número do chip "Campos · 1/3" que o
 * overlay e o omnibox mostram durante a execução — o único sinal de que existe
 * algo a preencher ali, já que os campos em si ficam atrás de um painel.
 *
 * Ausente e string vazia são a mesma coisa em toda a codificação de valor
 * (`serializeCustomValue`: checkbox desmarcado grava `""`, select sem opção
 * válida também), então a contagem tem esse único critério.
 */
export function countFilledCustomValues(fields: CustomField[], values: CustomValues): number {
  return fields.filter((field) => (values[field.id] ?? "") !== "").length;
}
