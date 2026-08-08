import { useAppConfig } from "@presentation/contexts/ConfigContext";
import { useIntegrations } from "@presentation/contexts/IntegrationsContext";
import { RefreshCw } from "lucide-react";
import { useEffect, useState } from "react";
import { DeskclockWorkspaceRow } from "../shared";

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
    <>
      <DeskclockWorkspaceRow
        configKey="clockifyDeskclockWorkspaceId"
        hint="Onde os projetos e as tags importados são criados, e de onde saem as horas enviadas."
      />
      <div className="border-t border-border-subtle px-4 py-3">
        <div className="flex items-center justify-between gap-3">
          {/* "Clockify", não "ativo": agora há dois workspaces em jogo na mesma
              tela, e o de cima é o do DeskClock. */}
          <span className="text-sm text-fg-secondary">Workspace Clockify</span>
          <div className="flex items-center gap-2">
            {workspaces.length > 0 ? (
              <select
                value={activeId}
                onChange={(e) => handleChange(e.target.value)}
                className="bg-raised border border-border rounded-chip px-2.5 py-1 text-xs text-fg focus:outline-none focus:border-accent max-w-[200px]"
              >
                {workspaces.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.name}
                  </option>
                ))}
              </select>
            ) : (
              <span className="text-xs text-fg-muted">{activeName || "—"}</span>
            )}
            <button
              onClick={handleRefresh}
              disabled={refreshing}
              title="Atualizar lista"
              className="text-fg-muted hover:text-fg-secondary disabled:opacity-50 transition-colors"
            >
              <RefreshCw size={14} className={refreshing ? "animate-spin" : ""} />
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
