import type { Category } from "@domain/entities/Category";
import type { UUID } from "@shared/types";

/**
 * As categorias que um projeto oferece.
 *
 * **Conjunto vazio devolve tudo**, e é essa regra que torna o filtro duro
 * seguro: projeto sem associação nenhuma — que é o estado de todos eles até
 * alguém popular a tabela — continua oferecendo o catálogo inteiro. Sem ela, a
 * migration sozinha deixaria todo autocomplete de categoria vazio.
 *
 * Id associado que já não existe no catálogo simplesmente não aparece: a lista
 * sai de `categories`, nunca dos ids, então uma associação órfã não inventa
 * entrada na tela.
 */
export function resolveCategoriesForProject(
  categories: Category[],
  allowedIds: Set<UUID>
): Category[] {
  if (allowedIds.size === 0) return categories;
  return categories.filter((c) => allowedIds.has(c.id));
}
