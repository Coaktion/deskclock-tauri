import { useAppConfig } from "@presentation/contexts/ConfigContext";
import { useIntegrationsUi } from "@presentation/contexts/IntegrationsUiContext";
import { useCategories } from "@presentation/hooks/useCategories";
import { useProjects } from "@presentation/hooks/useProjects";
import { MondayConnectModal } from "@presentation/modals/MondayConnectModal";
import { LogIn, LogOut } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@presentation/components/ui";
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
    // Os dois board ids **ficam**: descrevem a conta, não a sessão. Reconectar
    // com o mesmo token deve reencontrar o Portfólio onde ele estava, e limpá-los
    // faria a reconexão exigir dois ids que ninguém tem à mão.
    setConnected(false);
    setEmail("");
    setLoading(false);
  }

  return (
    <>
      <div className="rounded-card border border-border-subtle bg-surface">
        <div className="flex items-start gap-3 px-4 py-3 border-b border-border-subtle rounded-t-card overflow-hidden">
          <div className="mt-0.5 shrink-0">
            <MondayLogo size={20} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-semibold text-fg">Monday</h2>
              <StatusBadge connected={connected} email={email} />
            </div>
            <p className="text-xs text-fg-muted mt-0.5">
              Registre horas como atividades nos boards de projeto do Monday.
            </p>
          </div>
          <div className="shrink-0 flex items-center gap-2">
            {connected ? (
              <Button onClick={handleDisconnect} loading={loading} icon={<LogOut size={14} />}>
                Desconectar
              </Button>
            ) : (
              <Button
                variant="primary"
                onClick={() => setShowConnectModal(true)}
                icon={<LogIn size={14} />}
              >
                Conectar
              </Button>
            )}
          </div>
        </div>

        {connected && (
          <MondayConnectedSections
            reloadProjects={reloadProjects}
            reloadCategories={reloadCategories}
            onShowSendModal={() => openModal("monday-send")}
            onShowImportModal={() => openModal("monday-import")}
            onShowEntriesModal={() => openModal("monday-entries")}
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
