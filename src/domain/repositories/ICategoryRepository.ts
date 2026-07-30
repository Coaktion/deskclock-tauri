import type { Category } from "@domain/entities/Category";
import type { UUID } from "@shared/types";

export interface ICategoryRepository {
  /** `workspaceId` omitido devolve as categorias de TODOS os workspaces — é o caminho das integrações. */
  findAll(workspaceId?: UUID): Promise<Category[]>;
  /** `workspaceId` é obrigatório porque a unicidade do nome agora é por workspace. */
  findByName(name: string, workspaceId: UUID): Promise<Category | null>;
  save(category: Category): Promise<void>;
  update(id: UUID, name: string, defaultBillable: boolean): Promise<void>;
  delete(id: UUID): Promise<void>;
}
