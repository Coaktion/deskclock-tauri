import type { ClockifyCategoryMapping, ClockifyProjectMapping } from "@shared/types/clockifyConfig";

/**
 * Os vínculos DeskClock ↔ Clockify da seção "Mapeamentos". Ficam todos numa
 * lista só na config, cada um com o workspace **do Clockify** em que vale —
 * trocar o workspace do Clockify troca o recorte, não apaga nada. A tela e a
 * API local editam pelas mesmas funções (`docs-internal/specs/mcp.md` §7, D3b).
 */

/** Os vínculos que valem num workspace do Clockify — o que a tela lista. */
export function clockifyMappingsFor<T extends { workspaceId: string }>(
  all: T[],
  clockifyWorkspaceId: string
): T[] {
  return all.filter((m) => m.workspaceId === clockifyWorkspaceId);
}

/**
 * Vincula um projeto do DeskClock a um projeto do Clockify, ou desfaz o vínculo
 * com `null`. Um projeto tem no máximo um vínculo por workspace do Clockify.
 */
export function withClockifyProjectMapping(
  all: ClockifyProjectMapping[],
  clockifyWorkspaceId: string,
  deskclockProjectId: string,
  clockifyProject: { id: string; name: string } | null
): ClockifyProjectMapping[] {
  const rest = all.filter(
    (m) => !(m.workspaceId === clockifyWorkspaceId && m.deskclockProjectId === deskclockProjectId)
  );
  if (!clockifyProject) return rest;
  return [
    ...rest,
    {
      deskclockProjectId,
      clockifyProjectId: clockifyProject.id,
      clockifyProjectName: clockifyProject.name,
      workspaceId: clockifyWorkspaceId,
    },
  ];
}

/**
 * As tags de uma categoria. Lista vazia continua sendo um vínculo — é o que a
 * tela grava ao desmarcar a última tag.
 */
export function withClockifyCategoryMapping(
  all: ClockifyCategoryMapping[],
  clockifyWorkspaceId: string,
  deskclockCategoryId: string,
  tagIds: string[]
): ClockifyCategoryMapping[] {
  const rest = all.filter(
    (m) => !(m.workspaceId === clockifyWorkspaceId && m.deskclockCategoryId === deskclockCategoryId)
  );
  return [
    ...rest,
    { deskclockCategoryId, clockifyTagIds: tagIds, workspaceId: clockifyWorkspaceId },
  ];
}
