import { useAppConfig } from "@presentation/contexts/ConfigContext";
import { useIntegrationsUi } from "@presentation/contexts/IntegrationsUiContext";
import { useCategories } from "@presentation/hooks/useCategories";
import { useProjects } from "@presentation/hooks/useProjects";
import { MondayConnectModal } from "@presentation/modals/MondayConnectModal";
import { Loader2, LogIn, LogOut } from "lucide-react";
import { useEffect, useState } from "react";
import { StatusBadge } from "../shared";
import { MondayConnectedSections } from "./MondayConnectedSections";
import { MondayLogo } from "./MondayLogo";

export function MondayIntegrationCard() {
  const config = useAppConfig();
  const { reload: reloadProjects } = useProjects();
  const { reload: reloadCategories } = useCategories();
  const [connected, setConnected] = useState(false);
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [showConnectModal, setShowConnectModal] = useState(false);
  const { openModal } = useIntegrationsUi();

  useEffect(() => {
    if (!config.isLoaded) return;
    setConnected(!!config.get("mondayApiKey"));
    setEmail(config.get("mondayUserEmail"));
    // Hidratação única do estado local a partir da config já carregada;
    // `config` muda de identidade a cada set() e reabriria o card em loop.
  }, [config.isLoaded]); // eslint-disable-line react-hooks/exhaustive-deps

  function handleConnected() {
    setConnected(true);
    setEmail(config.get("mondayUserEmail"));
    setShowConnectModal(false);
  }

  async function handleDisconnect() {
    setLoading(true);
    await config.set("mondayApiKey", "");
    await config.set("mondayUserId", "");
    await config.set("mondayUserName", "");
    await config.set("mondayUserEmail", "");
    await config.set("mondayActiveWorkspaceId", "");
    await config.set("mondayActiveWorkspaceName", "");
    await config.set("mondayClientsFolderId", "");
    await config.set("mondayInternalFolderId", "");
    await config.set("mondayInternalBoardId", "");
    await config.set("mondayWorkspaceCache", []);
    await config.set("mondayFolderCache", []);
    await config.set("mondayBoardCache", []);
    setConnected(false);
    setEmail("");
    setLoading(false);
  }

  return (
    <>
      <div className="rounded-xl border border-gray-800 bg-gray-900/50">
        <div className="flex items-start gap-3 px-4 py-3 border-b border-gray-800 rounded-t-xl overflow-hidden">
          <div className="mt-0.5 shrink-0">
            <MondayLogo size={20} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-semibold text-gray-100">Monday</h2>
              <StatusBadge connected={connected} email={email} />
            </div>
            <p className="text-xs text-gray-500 mt-0.5">
              Registre horas como atividades nos boards de projeto do Monday.
            </p>
          </div>
          <div className="shrink-0 flex items-center gap-2">
            {connected ? (
              <button
                onClick={handleDisconnect}
                disabled={loading}
                className="flex items-center gap-1.5 text-xs bg-gray-800 hover:bg-gray-700 disabled:opacity-50 text-gray-300 px-3 py-1.5 rounded transition-colors"
              >
                {loading ? <Loader2 size={12} className="animate-spin" /> : <LogOut size={12} />}
                Desconectar
              </button>
            ) : (
              <button
                onClick={() => setShowConnectModal(true)}
                className="flex items-center gap-1.5 text-xs bg-blue-600 hover:bg-blue-500 text-white px-3 py-1.5 rounded transition-colors"
              >
                <LogIn size={12} />
                Conectar
              </button>
            )}
          </div>
        </div>

        {connected && (
          <MondayConnectedSections
            reloadProjects={reloadProjects}
            reloadCategories={reloadCategories}
            onShowSendModal={() => openModal("monday-send")}
          />
        )}
      </div>

      {showConnectModal && (
        <MondayConnectModal
          onConnected={handleConnected}
          onClose={() => setShowConnectModal(false)}
        />
      )}
    </>
  );
}
