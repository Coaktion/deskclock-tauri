import { filterProjectBoards } from "@domain/usecases/monday/filterProjectBoards";
import { useAppConfig } from "@presentation/contexts/ConfigContext";
import { useMondayCatalog } from "@presentation/hooks/useMondayCatalog";
import { RefreshCw } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";

const SELECT_CLASS =
  "shrink-0 bg-gray-800 border border-gray-700 rounded px-2.5 py-1 text-xs text-gray-200 focus:outline-none focus:border-blue-500 max-w-[200px]";

/** Rótulo + descrição à esquerda, controle à direita — o arranjo de toda a seção. */
function SettingRow({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="min-w-0">
        <span className="text-sm text-gray-300">{label}</span>
        {hint && <p className="text-[11px] text-gray-500 mt-0.5">{hint}</p>}
      </div>
      {children}
    </div>
  );
}

export function MondayWorkspaceSection() {
  const config = useAppConfig();
  const [activeId, setActiveId] = useState("");
  const [activeName, setActiveName] = useState("");
  const [clientsFolderId, setClientsFolderId] = useState("");
  const [internalFolderId, setInternalFolderId] = useState("");
  const [internalBoardId, setInternalBoardId] = useState("");
  const { workspaces, folders, boards, loading, refreshing, refresh, reset } =
    useMondayCatalog(activeId);

  useEffect(() => {
    if (!config.isLoaded) return;
    setActiveId(config.get("mondayActiveWorkspaceId"));
    setActiveName(config.get("mondayActiveWorkspaceName"));
    setClientsFolderId(config.get("mondayClientsFolderId"));
    setInternalFolderId(config.get("mondayInternalFolderId"));
    setInternalBoardId(config.get("mondayInternalBoardId"));
    // Hidratação única a partir da config já carregada: `config` é recriado a cada
    // render do provider e reverteria a seleção que o usuário acabou de fazer.
  }, [config.isLoaded]); // eslint-disable-line react-hooks/exhaustive-deps

  const internalBoards = internalFolderId ? filterProjectBoards(boards, internalFolderId) : [];
  const busy = loading || refreshing;

  async function handleChangeWorkspace(id: string) {
    const ws = workspaces.find((w) => w.id === id);
    if (!ws) return;
    setActiveId(id);
    setActiveName(ws.name);
    setClientsFolderId("");
    setInternalFolderId("");
    setInternalBoardId("");
    await config.set("mondayActiveWorkspaceId", id);
    await config.set("mondayActiveWorkspaceName", ws.name);
    await config.set("mondayClientsFolderId", "");
    await config.set("mondayInternalFolderId", "");
    await config.set("mondayInternalBoardId", "");
    // Pastas e boards do workspace anterior não valem mais.
    await reset(id);
  }

  async function handleChangeClientsFolder(id: string) {
    setClientsFolderId(id);
    await config.set("mondayClientsFolderId", id);
  }

  /** Trocar de pasta invalida o board vinculado: ele vivia na pasta anterior. */
  async function handleChangeInternalFolder(id: string) {
    setInternalFolderId(id);
    setInternalBoardId("");
    await config.set("mondayInternalFolderId", id);
    await config.set("mondayInternalBoardId", "");
  }

  async function handleChangeInternalBoard(id: string) {
    setInternalBoardId(id);
    await config.set("mondayInternalBoardId", id);
  }

  return (
    <div className="border-t border-gray-800 px-4 py-3 space-y-3">
      <SettingRow label="Workspace ativo">
        <div className="flex items-center gap-2">
          {workspaces.length > 0 ? (
            <select
              value={activeId}
              onChange={(e) => handleChangeWorkspace(e.target.value)}
              disabled={busy}
              className={SELECT_CLASS}
            >
              {workspaces.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name}
                </option>
              ))}
            </select>
          ) : (
            <span className="text-xs text-gray-500">
              {loading ? "Carregando…" : activeName || "—"}
            </span>
          )}
          <button
            onClick={refresh}
            disabled={busy}
            title="Atualizar workspaces, pastas e boards"
            className="text-gray-500 hover:text-gray-300 disabled:opacity-50 transition-colors"
          >
            <RefreshCw size={13} className={busy ? "animate-spin" : ""} />
          </button>
        </div>
      </SettingRow>

      <SettingRow
        label="Pasta de clientes"
        hint="Cada board da pasta vira um projeto. Sem pasta, os projetos são reconhecidos pelo nome do board."
      >
        {loading ? (
          <span className="shrink-0 text-xs text-gray-600 italic">Carregando…</span>
        ) : folders.length > 0 ? (
          <select
            value={clientsFolderId}
            onChange={(e) => handleChangeClientsFolder(e.target.value)}
            disabled={refreshing}
            className={SELECT_CLASS}
          >
            <option value="">Todas as pastas</option>
            {/* A pasta interna sai da lista: escolher a mesma nos dois campos
                esvaziaria a varredura de clientes sem nenhum aviso. */}
            {folders
              .filter((f) => f.id !== internalFolderId)
              .map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name}
                </option>
              ))}
          </select>
        ) : (
          <span className="shrink-0 text-xs text-gray-600 italic">Nenhuma pasta visível</span>
        )}
      </SettingRow>

      <SettingRow
        label="Pasta de projetos internos"
        hint="Dela entra um único board, escolhido abaixo. Os demais ficam de fora do import."
      >
        {loading ? (
          <span className="shrink-0 text-xs text-gray-600 italic">Carregando…</span>
        ) : folders.length > 0 ? (
          <select
            value={internalFolderId}
            onChange={(e) => handleChangeInternalFolder(e.target.value)}
            disabled={refreshing}
            className={SELECT_CLASS}
          >
            <option value="">Nenhuma</option>
            {folders
              .filter((f) => f.id !== clientsFolderId)
              .map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name}
                </option>
              ))}
          </select>
        ) : (
          <span className="shrink-0 text-xs text-gray-600 italic">Nenhuma pasta visível</span>
        )}
      </SettingRow>

      {internalFolderId && (
        <SettingRow
          label="Board interno"
          hint="Vira um projeto como qualquer outro; a granularidade vem da categoria. Escolher outro substitui o anterior."
        >
          {internalBoards.length > 0 ? (
            <select
              value={internalBoardId}
              onChange={(e) => handleChangeInternalBoard(e.target.value)}
              disabled={refreshing}
              className={SELECT_CLASS}
            >
              <option value="">Nenhum</option>
              {internalBoards.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          ) : (
            <span className="shrink-0 text-xs text-gray-600 italic">
              {busy ? "Carregando…" : "Nenhum board na pasta"}
            </span>
          )}
        </SettingRow>
      )}
    </div>
  );
}
