import type { UUID } from "@shared/types";

/**
 * De onde a associação veio. Separa o que o usuário escolheu à mão do que a
 * varredura diária do Monday semeou: sem essa distinção, a varredura apagaria a
 * escolha manual a cada dia.
 */
export type ProjectCategorySource = "monday" | "manual";

/**
 * Associação projeto ↔ categoria. Existindo ao menos uma para o projeto, os
 * autocompletes de categoria passam a oferecer só as associadas; sem nenhuma,
 * oferecem o catálogo inteiro (`resolveCategoriesForProject`).
 */
export interface ProjectCategory {
  projectId: UUID;
  categoryId: UUID;
  source: ProjectCategorySource;
  createdAt: string;
}
