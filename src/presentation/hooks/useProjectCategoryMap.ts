import { useState, useEffect, useCallback, useMemo } from "react";
import { listen } from "@tauri-apps/api/event";
import type { Category } from "@domain/entities/Category";
import type { ProjectCategory } from "@domain/entities/ProjectCategory";
import { useRepositories } from "@presentation/contexts/RepositoriesContext";
import { useActiveWorkspaceId } from "@presentation/contexts/WorkspaceContext";
import { OVERLAY_EVENTS } from "@shared/types/overlayEvents";
import { notifyProjectCategoriesChanged } from "@shared/utils/catalogSync";
import { resolveCategoriesForProject } from "@domain/usecases/projectCategories/resolveCategoriesForProject";
import { buildProjectCategoryMap } from "@domain/usecases/projectCategories/buildProjectCategoryMap";
import type { UUID } from "@shared/types";

const NO_ASSOCIATION: ReadonlySet<UUID> = new Set<UUID>();

/**
 * As categorias que cada projeto oferece nos autocompletes.
 *
 * **Carrega o mapa inteiro do workspace de uma vez**, em vez de consultar por
 * projeto. Três dos pontos de entrada são modais de importação (Agenda, Zendesk
 * e Monday) que renderizam um editor por item: um hook por linha viraria
 * dezenas de consultas para montar uma tela só.
 *
 * O que sai daqui serve **apenas às `options`** do autocomplete de categoria.
 * Toda busca que resolve um valor já existente — o nome exibido da categoria da
 * tarefa em execução, o casamento por nome que o import do Monday faz — segue no
 * catálogo cheio: o filtro governa o que se pode escolher, nunca o que o app
 * pode mostrar. Sem essa separação, desassociar uma categoria apagaria o nome
 * dela das tarefas que já a usam.
 *
 * Projeto sem associação nenhuma — e projeto nenhum — devolvem o catálogo
 * inteiro, pela regra de `resolveCategoriesForProject`.
 */
export function useProjectCategoryMap() {
  const { projectCategoryRepo } = useRepositories();
  const workspaceId = useActiveWorkspaceId();
  // As linhas cruas ficam ao lado do mapa porque a tela de Dados precisa da
  // **origem** de cada associação para marcar as do Monday; os autocompletes,
  // que são a maioria dos consumidores, só precisam do mapa.
  const [rows, setRows] = useState<ProjectCategory[]>([]);
  const [map, setMap] = useState<Map<UUID, Set<UUID>>>(() => new Map());
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const data = await projectCategoryRepo.findAll(workspaceId);
    setRows(data);
    setMap(buildProjectCategoryMap(data));
    setLoading(false);
  }, [projectCategoryRepo, workspaceId]);

  useEffect(() => {
    void load();
  }, [load]);

  // Mesma razão de `useCategories`: cada janela tem o seu, e o `overlay-popup`
  // nasce com o app e nunca remonta.
  useEffect(() => {
    const unlisten = listen(OVERLAY_EVENTS.PROJECT_CATEGORIES_CHANGED, () => void load());
    return () => {
      unlisten.then((fn) => fn());
    };
  }, [load]);

  const categoriesFor = useCallback(
    (categories: Category[], projectId: UUID | null | undefined): Category[] =>
      resolveCategoriesForProject(
        categories,
        (projectId ? map.get(projectId) : undefined) ?? NO_ASSOCIATION
      ),
    [map]
  );

  /**
   * Grava a seleção de um projeto e avisa as outras janelas — sem o aviso, o
   * `overlay-popup`, que nasce com o app e nunca remonta, seguiria oferecendo o
   * recorte antigo durante a execução (§9.2).
   */
  const setForProject = useCallback(
    async (projectId: UUID, categoryIds: UUID[]) => {
      await projectCategoryRepo.setForProject(projectId, categoryIds);
      await load();
      await notifyProjectCategoriesChanged();
    },
    [projectCategoryRepo, load]
  );

  return useMemo(
    () => ({ rows, categoriesFor, setForProject, loading, reload: load }),
    [rows, categoriesFor, setForProject, loading, load]
  );
}

export type UseProjectCategoryMapResult = ReturnType<typeof useProjectCategoryMap>;
