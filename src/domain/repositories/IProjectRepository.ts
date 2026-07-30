import type { Project } from "@domain/entities/Project";
import type { UUID } from "@shared/types";

export interface IProjectRepository {
  /** `workspaceId` omitido devolve os projetos de TODOS os workspaces — é o caminho das integrações. */
  findAll(workspaceId?: UUID): Promise<Project[]>;
  /** `workspaceId` é obrigatório porque a unicidade do nome agora é por workspace. */
  findByName(name: string, workspaceId: UUID): Promise<Project | null>;
  save(project: Project): Promise<void>;
  update(id: UUID, name: string): Promise<void>;
  delete(id: UUID): Promise<void>;
}
