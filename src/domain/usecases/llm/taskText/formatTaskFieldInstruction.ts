import type { TaskFieldHint } from "./types";

/**
 * A instrução que fica acima do input, por exemplo:
 * "Nome, Projeto, Categoria, Billable, nessa ordem e por vírgula; dá para pular
 * campo. Ex.: Revisão, Tech interno, Development, nb".
 *
 * As siglas (`P=`) continuam aceitas, mas a instrução anuncia só a ordem: é o
 * jeito que o usuário prefere digitar.
 *
 * Os exemplos são valores reais do catálogo — por isso a linha é só da tela e
 * nunca entra no prompt.
 */
export function formatTaskFieldInstruction(hints: TaskFieldHint[]): string {
  if (hints.length === 0) return "";
  const labels = hints.map((h) => h.label).join(", ");
  const examples = hints.flatMap((h) => (h.example ? [h.example] : []));
  const example = examples.length > 0 ? ` Ex.: Revisão, ${examples.join(", ")}` : "";
  return `Nome, ${labels}, nessa ordem e por vírgula; dá para pular campo.${example}`;
}
