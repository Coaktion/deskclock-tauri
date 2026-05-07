import { useAppConfig } from "@presentation/contexts/ConfigContext";
import { useIntegrations } from "@presentation/contexts/IntegrationsContext";
import { RefreshCw } from "lucide-react";
import { useEffect, useState } from "react";

export function ClockifyWorkspaceSection() {
  const config = useAppConfig();
  const factories = useIntegrations();
  const [activeId, setActiveId] = useState("");
  const [activeName, setActiveName] = useState("");
  const [workspaces, setWorkspaces] = useState<{ id: string; name: string }[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    if (!config.isLoaded) return;
    setActiveId(config.get("clockifyActiveWorkspaceId"));
    setActiveName(config.get("clockifyActiveWorkspaceName"));
    const cached = config.get("clockifyWorkspaceCache");
    if (cached.length > 0) setWorkspaces(cached);
  }, [config.isLoaded]); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleRefresh() {
    setRefreshing(true);
    try {
      const client = factories.createClockifyApi();
      const list = await client.listWorkspaces();
      setWorkspaces(list);
      await config.set("clockifyWorkspaceCache", list);
    } catch {
      // erro silencioso — lista anterior permanece
    } finally {
      setRefreshing(false);
    }
  }

  async function handleChange(id: string) {
    const ws = workspaces.find((w) => w.id === id);
    if (!ws) return;
    setActiveId(id);
    setActiveName(ws.name);
    await config.set("clockifyActiveWorkspaceId", id);
    await config.set("clockifyActiveWorkspaceName", ws.name);
  }

  return (
    <div className="border-t border-gray-800 px-4 py-3">
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm text-gray-300">Workspace ativo</span>
        <div className="flex items-center gap-2">
          {workspaces.length > 0 ? (
            <select
              value={activeId}
              onChange={(e) => handleChange(e.target.value)}
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
    </div>
  );
}
