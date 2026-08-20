import type { UUID } from "@shared/types";

/** Item de catálogo escopado por workspace: um projeto ou uma categoria. */
export interface CatalogEntry {
  id: UUID;
  name: string;
}

export type CatalogResolution =
  { kind: "match"; targetId: UUID } | { kind: "create"; name: string } | { kind: "unset" };

/**
 * Proposta de reconciliação ao mover ou copiar uma tarefa entre workspaces.
 *
 * Projeto e categoria são escopados por workspace, então o id de origem não
 * existe no destino. Esta função devolve apenas a **sugestão** que o
 * `MoveToWorkspaceModal` pré-seleciona — o usuário pode trocar por qualquer das
 * três saídas antes de confirmar.
 *
 * Custom fields não passam por aqui: são globais justamente para que mover uma
 * tarefa não exija reconciliar campo e opção de select além de projeto e
 * categoria.
 */
export function reconcileCatalog(
  sourceName: string | null | undefined,
  destination: readonly CatalogEntry[]
): CatalogResolution {
  const trimmed = sourceName?.trim();
  if (!trimmed) return { kind: "unset" };

  const match = destination.find(
    (entry) => entry.name.trim().toLowerCase() === trimmed.toLowerCase()
  );
  if (match) return { kind: "match", targetId: match.id };

  return { kind: "create", name: trimmed };
}
