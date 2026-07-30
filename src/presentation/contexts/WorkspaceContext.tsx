import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { Workspace } from "@domain/entities/Workspace";
import { DEFAULT_WORKSPACE_ID } from "@domain/entities/Workspace";
import { useRepositories } from "@presentation/contexts/RepositoriesContext";
import { useAppConfig } from "@presentation/contexts/ConfigContext";
import { getWorkspaces } from "@domain/usecases/workspaces/GetWorkspaces";

export interface WorkspaceContextValue {
  workspaces: Workspace[];
  activeWorkspaceId: string;
  activeWorkspace: Workspace | null;
  loading: boolean;
  /** Troca o workspace ativo e persiste a escolha. */
  switchTo: (id: string) => Promise<void>;
  /** Recarrega a lista — chamada após CRUD de workspace. */
  reload: () => Promise<void>;
}

const WorkspaceContext = createContext<WorkspaceContextValue | null>(null);

/**
 * Fonte única do workspace ativo.
 *
 * É daqui que `useProjects`, `useCategories`, `useTasks`, `useHistory`,
 * `usePlannedTasks` e `useExportProfiles` leem o escopo — por isso nenhuma
 * assinatura pública desses hooks mudou. `useProjects` sozinho tem 13
 * chamadores em 12 fluxos de execução; passar o workspace por parâmetro
 * significaria editar todos eles sem ganho nenhum.
 */
export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const { workspaceRepo } = useRepositories();
  const { isLoaded, get, set } = useAppConfig();

  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [activeWorkspaceId, setActiveWorkspaceId] = useState<string>(DEFAULT_WORKSPACE_ID);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    const list = await getWorkspaces(workspaceRepo);
    setWorkspaces(list);
    return list;
  }, [workspaceRepo]);

  useEffect(() => {
    if (!isLoaded) return;
    let cancelled = false;

    (async () => {
      const list = await getWorkspaces(workspaceRepo);
      if (cancelled) return;
      setWorkspaces(list);

      // Um id persistido pode apontar para um workspace já excluído — nesse
      // caso cai no "Padrão", e no primeiro da lista se nem ele existir mais.
      const stored = get("activeWorkspaceId");
      const valid = stored && list.some((w) => w.id === stored);
      const fallback = list.some((w) => w.id === DEFAULT_WORKSPACE_ID)
        ? DEFAULT_WORKSPACE_ID
        : (list[0]?.id ?? DEFAULT_WORKSPACE_ID);

      setActiveWorkspaceId(valid ? stored : fallback);
      setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [isLoaded, workspaceRepo, get]);

  const switchTo = useCallback(
    async (id: string) => {
      setActiveWorkspaceId(id);
      await set("activeWorkspaceId", id);
    },
    [set]
  );

  const value = useMemo<WorkspaceContextValue>(
    () => ({
      workspaces,
      activeWorkspaceId,
      activeWorkspace: workspaces.find((w) => w.id === activeWorkspaceId) ?? null,
      loading,
      switchTo,
      reload: async () => {
        await reload();
      },
    }),
    [workspaces, activeWorkspaceId, loading, switchTo, reload]
  );

  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>;
}

export function useWorkspaces(): WorkspaceContextValue {
  const ctx = useContext(WorkspaceContext);
  if (!ctx) throw new Error("useWorkspaces must be used within a WorkspaceProvider");
  return ctx;
}

/**
 * Atalho para o caso mais comum: só o id do workspace ativo, que é o que os
 * hooks de dados precisam passar aos repositórios.
 */
export function useActiveWorkspaceId(): string {
  return useWorkspaces().activeWorkspaceId;
}
