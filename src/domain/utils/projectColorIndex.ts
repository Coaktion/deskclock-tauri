import type { Project } from "@domain/entities/Project";

/**
 * Slot de cor para um projeto novo: o menor índice que ninguém do workspace usa.
 *
 * "O menor livre" e não "o próximo" de propósito — excluir um projeto abre um
 * buraco, e reaproveitá-lo é o que mantém o catálogo dentro da faixa da paleta
 * em vez de empurrar o índice para cima a cada ciclo de criar e excluir. Dois
 * projetos só compartilham cor depois que a paleta inteira estiver ocupada.
 *
 * A lista de entrada é a do **workspace** em que o projeto vai nascer: cor é
 * ambiente de trabalho, e um índice repetido entre workspaces diferentes nunca
 * aparece na mesma tela.
 *
 * **Duas criações concorrentes podem receber o mesmo índice**, e não há UNIQUE em
 * `(workspace_id, color_index)` de propósito. Ler o catálogo e gravar não é
 * atômico, e o `ensureProject` do import do Monday já conta com criação em
 * paralelo entre janelas. Com a constraint, a corrida custaria o **projeto** — o
 * INSERT falharia e o item do Portfólio sumiria da importação; sem ela, custa
 * uma cor compartilhada entre dois projetos, que é o estado normal de qualquer
 * catálogo maior que a paleta. Perder cor é menos grave que perder dado.
 */
export function nextProjectColorIndex(existing: Project[]): number {
  const usados = new Set(existing.map((p) => p.colorIndex));
  let indice = 0;
  while (usados.has(indice)) indice++;
  return indice;
}
