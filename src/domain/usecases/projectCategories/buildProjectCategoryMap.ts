import type { ProjectCategory } from "@domain/entities/ProjectCategory";
import type { UUID } from "@shared/types";

/**
 * Agrupa as associações por projeto, para o recorte de cada autocomplete sair de
 * uma consulta só.
 *
 * A origem (`manual` ou `monday`) **não entra**: para decidir o que o campo
 * oferece, as duas valem igual — a distinção existe para a varredura do Monday
 * não apagar a escolha do usuário, e isso se resolve na escrita, não na leitura.
 */
export function buildProjectCategoryMap(rows: ProjectCategory[]): Map<UUID, Set<UUID>> {
  const map = new Map<UUID, Set<UUID>>();
  for (const row of rows) {
    const set = map.get(row.projectId) ?? new Set<UUID>();
    set.add(row.categoryId);
    map.set(row.projectId, set);
  }
  return map;
}
