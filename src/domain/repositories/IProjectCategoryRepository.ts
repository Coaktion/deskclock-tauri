import type { ProjectCategory } from "@domain/entities/ProjectCategory";
import type { UUID } from "@shared/types";

export interface IProjectCategoryRepository {
  findByProject(projectId: UUID): Promise<ProjectCategory[]>;
  /** `workspaceId` omitido devolve as associações de TODOS os workspaces. */
  findAll(workspaceId?: UUID): Promise<ProjectCategory[]>;
  /**
   * Substitui as associações `manual` do projeto. **Não toca nas `monday`** — a
   * varredura é dona delas, e rebaixá-las aqui as faria voltar no ciclo seguinte
   * como se o usuário nunca tivesse mexido.
   */
  setManual(projectId: UUID, categoryIds: UUID[]): Promise<void>;
  /**
   * Substitui as associações `monday` do projeto. Um par que já é `manual`
   * permanece `manual`: o usuário escolheu aquilo, e a varredura não tem por que
   * reivindicá-lo.
   */
  replaceMondayFor(projectId: UUID, categoryIds: UUID[]): Promise<void>;
}
