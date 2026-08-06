import type { ProjectCategory } from "@domain/entities/ProjectCategory";
import type { UUID } from "@shared/types";

export interface IProjectCategoryRepository {
  findByProject(projectId: UUID): Promise<ProjectCategory[]>;
  /** `workspaceId` omitido devolve as associações de TODOS os workspaces. */
  findAll(workspaceId?: UUID): Promise<ProjectCategory[]>;
  /**
   * Grava a seleção da tela de Dados: **o que não está na lista sai, seja qual
   * for a origem**, e o que entra entra como `manual`.
   *
   * Apagar uma linha `monday` daqui é deliberado — é a saída de emergência do
   * filtro duro, e sem ela a tela mostraria uma caixa que desmarca e não apaga.
   * A varredura seguinte a recria: quem quer removê-la de vez tira o Activity
   * Type do board. Categoria que já era `monday` e **continua** na seleção segue
   * `monday` (o `INSERT OR IGNORE` não a rebaixa), ou a varredura passaria a
   * enxergá-la como escolha manual e nunca mais a atualizaria.
   */
  setForProject(projectId: UUID, categoryIds: UUID[]): Promise<void>;
  /**
   * Substitui as associações `monday` do projeto. Um par que já é `manual`
   * permanece `manual`: o usuário escolheu aquilo, e a varredura não tem por que
   * reivindicá-lo.
   */
  replaceMondayFor(projectId: UUID, categoryIds: UUID[]): Promise<void>;
}
