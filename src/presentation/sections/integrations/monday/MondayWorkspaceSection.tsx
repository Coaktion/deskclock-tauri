import { useAppConfig } from "@presentation/contexts/ConfigContext";
import { useIntegrations } from "@presentation/contexts/IntegrationsContext";
import type { MondayFolder } from "@shared/types/monday";
import { RefreshCw } from "lucide-react";
import { useEffect, useState } from "react";

export function MondayWorkspaceSection() {
  const config = useAppConfig();
  const factories = useIntegrations();
  const [activeId, setActiveId] = useState("");
  const [activeName, setActiveName] = useState("");
  const [workspaces, setWorkspaces] = useState<{ id: string; name: string }[]>([]);
  const [folders, setFolders] = useState<MondayFolder[]>([]);
  const [folderId, setFolderId] = useState("");
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    if (!config.isLoaded) return;
    setActiveId(config.get("mondayActiveWorkspaceId"));
    setActiveName(config.get("mondayActiveWorkspaceName"));
    setFolderId(config.get("mondayProjectsFolderId"));
    const cached = config.get("mondayWorkspaceCache");
    if (cached.length > 0) setWorkspaces(cached);
    // Hidratação única a partir da config já carregada; `config` muda de identidade
    // a cada set() e reverteria a seleção que o próprio usuário acabou de fazer.
  }, [config.isLoaded]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!config.isLoaded || !activeId) return;
    let cancelled = false;
    factories
      .createMondayApi()
      .listFolders(activeId)
      .then((list) => {
        if (!cancelled) setFolders(list);
      })
      .catch(() => {
        // o token pode não enxergar pastas — o filtro cai no padrão de nome
      });
    return () => {
      cancelled = true;
    };
    // `factories` muda de identidade a cada set() na config; incluí-lo dispararia
    // uma consulta de pastas ao Monday a cada troca de qualquer configuração.
  }, [config.isLoaded, activeId]); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleRefresh() {
    setRefreshing(true);
    try {
      const client = factories.createMondayApi();
      const list = await client.listWorkspaces();
      setWorkspaces(list);
      await config.set("mondayWorkspaceCache", list);
    } catch {
      // erro silencioso — lista anterior permanece
    } finally {
      setRefreshing(false);
    }
  }

  async function handleChangeWorkspace(id: string) {
    const ws = workspaces.find((w) => w.id === id);
    if (!ws) return;
    setActiveId(id);
    setActiveName(ws.name);
    setFolderId("");
    await config.set("mondayActiveWorkspaceId", id);
    await config.set("mondayActiveWorkspaceName", ws.name);
    await config.set("mondayProjectsFolderId", "");
  }

  async function handleChangeFolder(id: string) {
    setFolderId(id);
    await config.set("mondayProjectsFolderId", id);
  }

  return (
    <div className="border-t border-gray-800 px-4 py-3 space-y-3">
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm text-gray-300">Workspace ativo</span>
        <div className="flex items-center gap-2">
          {workspaces.length > 0 ? (
            <select
              value={activeId}
              onChange={(e) => handleChangeWorkspace(e.target.value)}
              className="bg-gray-800 border border-gray-700 rounded px-2.5 py-1 text-xs text-gray-200 focus:outline-none focus:border-blue-500 max-w-[200px]"
            >
              {workspaces.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name}
                </option>
              ))}
            </select>
          ) : (
            <span className="text-xs text-gray-500">{activeName || "—"}</span>
          )}
          <button
            onClick={handleRefresh}
            disabled={refreshing}
            title="Atualizar lista"
            className="text-gray-500 hover:text-gray-300 disabled:opacity-50 transition-colors"
          >
            <RefreshCw size={13} className={refreshing ? "animate-spin" : ""} />
          </button>
        </div>
      </div>

      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <span className="text-sm text-gray-300">Pasta de projetos</span>
          <p className="text-[11px] text-gray-500 mt-0.5">
            Restringe a importação a uma pasta. Sem pasta, os projetos são reconhecidos pelo nome do
            board.
          </p>
        </div>
        {folders.length > 0 ? (
          <select
            value={folderId}
            onChange={(e) => handleChangeFolder(e.target.value)}
            className="shrink-0 bg-gray-800 border border-gray-700 rounded px-2.5 py-1 text-xs text-gray-200 focus:outline-none focus:border-blue-500 max-w-[200px]"
          >
            <option value="">Todas as pastas</option>
            {folders.map((f) => (
              <option key={f.id} value={f.id}>
                {f.name}
              </option>
            ))}
          </select>
        ) : (
          <span className="shrink-0 text-xs text-gray-600 italic">Nenhuma pasta visível</span>
        )}
      </div>
    </div>
  );
}
