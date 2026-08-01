import { useAppConfig } from "@presentation/contexts/ConfigContext";
import { useIntegrations } from "@presentation/contexts/IntegrationsContext";
import type { MondayBoardRef, MondayFolder } from "@shared/types/monday";
import type { MondayWorkspaceRef } from "@shared/types/mondayConfig";
import { useCallback, useEffect, useState } from "react";

export interface MondayCatalog {
  workspaces: MondayWorkspaceRef[];
  folders: MondayFolder[];
  boards: MondayBoardRef[];
  /** Primeira carga, sem nada em cache — a tela não tem o que mostrar ainda. */
  loading: boolean;
  /** Recarga manual pedida pelo usuário, com o cache anterior ainda na tela. */
  refreshing: boolean;
  refresh: () => Promise<void>;
  /** Troca de workspace: o catálogo do anterior não vale mais. */
  reset: (workspaceId: string) => Promise<void>;
}

/**
 * Workspaces, pastas e boards do Monday, cacheados na config.
 *
 * Sem cache a tela disparava três chamadas à API a cada abertura, sem indicar
 * carregamento — numa conta grande a seção ficava vários segundos parecendo
 * quebrada. A busca automática só acontece quando não há cache; depois disso,
 * quem decide recarregar é o botão de atualizar.
 */
export function useMondayCatalog(activeWorkspaceId: string): MondayCatalog {
  const config = useAppConfig();
  const factories = useIntegrations();
  const [workspaces, setWorkspaces] = useState<MondayWorkspaceRef[]>([]);
  const [folders, setFolders] = useState<MondayFolder[]>([]);
  const [boards, setBoards] = useState<MondayBoardRef[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    if (!config.isLoaded) return;
    setWorkspaces(config.get("mondayWorkspaceCache"));
    setFolders(config.get("mondayFolderCache"));
    setBoards(config.get("mondayBoardCache"));
    // Hidratação única: só lemos a config na carga. `config` é recriado a cada
    // render do provider, então tê-lo nas deps desfaria a escolha do usuário.
  }, [config.isLoaded]); // eslint-disable-line react-hooks/exhaustive-deps

  const fetchAll = useCallback(
    async (workspaceId: string) => {
      const api = factories.createMondayApi();
      // Em paralelo: são independentes, e em série a espera seria a soma delas.
      const [nextWorkspaces, nextFolders, nextBoards] = await Promise.all([
        api.listWorkspaces().catch(() => null),
        workspaceId ? api.listFolders(workspaceId).catch(() => null) : Promise.resolve(null),
        workspaceId ? api.listBoards(workspaceId).catch(() => null) : Promise.resolve(null),
      ]);

      // Cada lista falha por conta própria (o token pode não enxergar pastas);
      // a que falhou mantém o cache anterior em vez de esvaziar a tela.
      if (nextWorkspaces) {
        setWorkspaces(nextWorkspaces);
        await config.set("mondayWorkspaceCache", nextWorkspaces);
      }
      if (nextFolders) {
        setFolders(nextFolders);
        await config.set("mondayFolderCache", nextFolders);
      }
      if (nextBoards) {
        setBoards(nextBoards);
        await config.set("mondayBoardCache", nextBoards);
      }
    },
    // `factories` e `config` são recriados a cada render do provider; incluí-los
    // recriaria o callback e redispararia o efeito de primeira carga.
    [] // eslint-disable-line react-hooks/exhaustive-deps
  );

  const refresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await fetchAll(activeWorkspaceId);
    } finally {
      setRefreshing(false);
    }
  }, [fetchAll, activeWorkspaceId]);

  const reset = useCallback(
    async (workspaceId: string) => {
      setFolders([]);
      setBoards([]);
      await config.set("mondayFolderCache", []);
      await config.set("mondayBoardCache", []);
      setLoading(true);
      try {
        await fetchAll(workspaceId);
      } finally {
        setLoading(false);
      }
    },
    [fetchAll] // eslint-disable-line react-hooks/exhaustive-deps
  );

  useEffect(() => {
    if (!config.isLoaded || !activeWorkspaceId) return;
    const cached =
      config.get("mondayFolderCache").length > 0 || config.get("mondayBoardCache").length > 0;
    if (cached) return;
    let cancelled = false;
    setLoading(true);
    fetchAll(activeWorkspaceId).finally(() => {
      if (!cancelled) setLoading(false);
    });
    return () => {
      cancelled = true;
    };
    // Só na primeira carga: com cache preenchido, quem recarrega é o usuário.
  }, [config.isLoaded, activeWorkspaceId, fetchAll]); // eslint-disable-line react-hooks/exhaustive-deps

  return { workspaces, folders, boards, loading, refreshing, refresh, reset };
}
