import type { CustomField } from "@domain/entities/CustomField";

/**
 * Toda a conversão entre o valor que a UI manipula e a string única gravada em
 * `task_custom_values.value`. Fica num só lugar porque a chave de agrupamento
 * (`taskGroupKey`) compara essas strings: duas representações do mesmo valor
 * partiriam um grupo em dois sem nenhum sintoma visível.
 *
 * - `checkbox` → `"1"` quando marcado, `""` quando não. Desmarcado é a
 *   **ausência** de valor, e não `"0"`: se gravasse `"0"`, uma tarefa em que o
 *   usuário marcou e desmarcou a caixa deixaria de agrupar com uma em que ele
 *   nunca a tocou.
 * - `select`   → id da opção (não o label: renomear a opção não pode reescrever
 *   o histórico)
 * - `text` / `multiline` → o próprio texto, com as pontas aparadas
 */
export function serializeCustomValue(field: CustomField, input: string | boolean): string {
  if (field.type === "checkbox") {
    const truthy = typeof input === "boolean" ? input : input === "1" || input === "true";
    return truthy ? "1" : "";
  }
  const text = typeof input === "boolean" ? (input ? "1" : "") : input;
  if (field.type === "select") {
    return field.options.some((o) => o.id === text) ? text : "";
  }
  return field.type === "multiline" ? text.trim() : text.trim().replace(/\s+/g, " ");
}

/** Texto legível do valor — usado na exportação e em qualquer exibição. */
export function formatCustomValue(field: CustomField, stored: string): string {
  if (field.type === "checkbox") return stored === "1" ? "Sim" : "Não";
  if (field.type === "select") {
    return field.options.find((o) => o.id === stored)?.label ?? "";
  }
  return stored;
}

/**
 * O **par explícito de `formatCustomValue`**: texto legível → valor gravado.
 *
 * Existe porque o deeplink de compartilhamento carrega o texto legível, e
 * `serializeCustomValue` não serve de volta: ele espera a entrada da UI — o id
 * da opção no `select`, `"1"`/`"true"` no `checkbox` —, então uma caixa marcada
 * chegava como `"Sim"` e voltava desmarcada, em silêncio.
 *
 * - `checkbox`: `"Sim"` (aparado, caixa indiferente) → `"1"`; qualquer outra
 *   coisa → `""`, que é a ausência de valor de `serializeCustomValue`.
 * - `select`: casa pelo **rótulo** da opção (aparado, caixa indiferente) e
 *   devolve o id. **Dois rótulos iguais no mesmo campo: o primeiro vence** — o
 *   texto não distingue os dois, e escolher o primeiro ao menos é estável.
 *   Rótulo que não existe aqui → `""`.
 * - `text` / `multiline`: passa por `serializeCustomValue`, para herdar o mesmo
 *   aparo (colapsa espaços no `text`, preserva quebras no `multiline`).
 */
export function deserializeCustomValue(field: CustomField, text: string): string {
  if (field.type === "checkbox") {
    return text.trim().toLowerCase() === "sim" ? "1" : "";
  }
  if (field.type === "select") {
    const wanted = text.trim().toLowerCase();
    if (!wanted) return "";
    return field.options.find((o) => o.label.trim().toLowerCase() === wanted)?.id ?? "";
  }
  return serializeCustomValue(field, text);
}
