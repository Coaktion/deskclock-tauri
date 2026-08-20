import { useCallback, useEffect, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import type { Category } from "@domain/entities/Category";
import type { Project } from "@domain/entities/Project";
import { getCategories } from "@domain/usecases/categories/GetCategories";
import { getProjects } from "@domain/usecases/projects/GetProjects";
import { resolveIntegrationWorkspaceId } from "@domain/usecases/workspaces/resolveIntegrationWorkspaceId";
import { useAppConfig } from "@presentation/contexts/ConfigContext";
import { useRepositories } from "@presentation/contexts/RepositoriesContext";
import { OVERLAY_EVENTS } from "@shared/types/overlayEvents";
import type { IntegrationWorkspaceKey } from "@shared/types/appConfig";

/**
 * Projetos e categorias do workspace **da integração** — não do ativo.
 *
 * É o par de `useProjects`/`useCategories` para as telas de integração, e existe
 * porque aquelas leem o workspace aberto na tela: com o import criando no
 * workspace da integração, os catálogos do ativo fariam a planejada nascer
 * apontando para um projeto de **outro** workspace, que a tela nem exibe. Nos
 * modais de envio é o mesmo raciocínio ao contrário — as tarefas listadas são as
 * da integração, e o nome do projeto de cada uma tem de sair do catálogo dela.
 *
 * Só leitura: quem cria projeto ou categoria continua sendo o import da própria
 * integração, que já avisa as outras janelas (§9.2).
 *
 * `configKey` nulo não consulta nada — é o modal fechado, e o hook não pode ser
 * chamado condicionalmente.
 */
export function useIntegrationCatalogs(configKey: IntegrationWorkspaceKey | null) {
  const { projectRepo, categoryRepo } = useRepositories();
  const config = useAppConfig();
  const [projects, setProjects] = useState<Project[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);

  const workspaceId =
    configKey && config.isLoaded ? resolveIntegrationWorkspaceId(config.get(configKey)) : null;

  const load = useCallback(async () => {
    if (!workspaceId) return;
    const [nextProjects, nextCategories] = await Promise.all([
      getProjects(projectRepo, workspaceId),
      getCategories(categoryRepo, workspaceId),
    ]);
    setProjects(nextProjects);
    setCategories(nextCategories);
  }, [projectRepo, categoryRepo, workspaceId]);

  useEffect(() => {
    void load();
  }, [load]);

  // O import de uma integração cria projeto e categoria pelo repositório; sem
  // ouvir o aviso, o modal aberto seguiria com o catálogo de antes do import.
  useEffect(() => {
    const unlisten = [
      listen(OVERLAY_EVENTS.PROJECTS_CHANGED, () => void load()),
      listen(OVERLAY_EVENTS.CATEGORIES_CHANGED, () => void load()),
    ];
    return () => {
      unlisten.forEach((p) => p.then((fn) => fn()));
    };
  }, [load]);

  return { projects, categories };
}
