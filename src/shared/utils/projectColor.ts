import type { Project } from "@domain/entities/Project";

/**
 * Devolve `var(--color-project-N)`, não um valor de cor: o retorno vai em
 * `style={{ backgroundColor }}`, onde a variável resolve como qualquer outra —
 * e é isso que mantém a paleta declarada num lugar só, no `@theme`.
 */
const PROJECT_COLORS = Array.from({ length: 24 }, (_, i) => `var(--color-project-${i + 1})`);

/**
 * Cor do projeto, a partir do slot que ele carrega.
 *
 * Recebe a **entidade**, não o id, e a diferença é o ponto do modelo: enquanto a
 * cor saía de `hash(id) % 6`, dois projetos quaisquer tinham chance alta de
 * coincidir (com 60 projetos, cada cor carregava ~10 deles). O slot vem
 * atribuído da criação — ver `nextProjectColorIndex` —, então a coincidência só
 * começa depois que a paleta inteira estiver ocupada.
 *
 * O índice dá a volta na paleta, e é aqui que a volta acontece: o banco guarda o
 * índice cru justamente para que crescer ou encolher a paleta não reescreva
 * nada. Projeto ausente — não informado, ou id apontando para projeto excluído —
 * cai no cinza de "sem projeto", que é o que ele é.
 */
export function getProjectColor(project: Project | null | undefined): string {
  if (!project) return "var(--color-project-none)";
  const slot =
    ((project.colorIndex % PROJECT_COLORS.length) + PROJECT_COLORS.length) % PROJECT_COLORS.length;
  return PROJECT_COLORS[slot];
}
