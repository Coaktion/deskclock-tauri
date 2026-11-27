import type { TaskFieldHint } from "./types";

function joinPtBr(items: string[]): string {
  if (items.length <= 1) return items.join("");
  return `${items.slice(0, -1).join(", ")} e ${items[items.length - 1]}`;
}

/**
 * A instrução que fica acima do input, por exemplo:
 * "Informe Projeto, Categoria e Billable. P= Tech interno / C= Development / B= nb".
 *
 * Os exemplos são valores reais do catálogo — por isso a linha é só da tela e
 * nunca entra no prompt.
 */
export function formatTaskFieldInstruction(hints: TaskFieldHint[]): string {
  if (hints.length === 0) return "";
  const labels = joinPtBr(hints.map((h) => h.label));
  const siglas = hints.map((h) => (h.example ? `${h.sigla}= ${h.example}` : h.sigla)).join(" / ");
  return `Informe ${labels}. ${siglas}`;
}
