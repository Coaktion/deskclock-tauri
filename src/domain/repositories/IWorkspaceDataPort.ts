import type { UUID } from "@shared/types";

/**
 * Porta estreita para o destino dos dados na exclusão de um workspace.
 *
 * Existe separada de `IWorkspaceRepository` porque a operação atravessa cinco
 * tabelas (tarefas, planejadas, projetos, categorias e perfis de exportação) e
 * precisa ser atômica — a implementação em `infra/` resolve isso numa única
 * transação. O use case não precisa saber quantas tabelas são.
 */
export interface IWorkspaceDataPort {
  /** Reatribui todo o conteúdo de um workspace para outro. */
  moveAll(fromWorkspaceId: UUID, toWorkspaceId: UUID): Promise<void>;
  /** Apaga todo o conteúdo de um workspace. */
  deleteAll(workspaceId: UUID): Promise<void>;
}
