import { useAppConfig } from "@presentation/contexts/ConfigContext";
import { useIntegrationsUi } from "@presentation/contexts/IntegrationsUiContext";
import { useCategories } from "@presentation/hooks/useCategories";
import { useProjects } from "@presentation/hooks/useProjects";
import { useTour } from "@presentation/hooks/useTour";
import { ClockifyConnectModal } from "@presentation/modals/ClockifyConnectModal";
import { LogIn, LogOut } from "lucide-react";
import { useEffect, useState } from "react";
import { Button, TourButton } from "@presentation/components/ui";
import { StatusBadge } from "../shared";
import { ClockifyConnectedSections } from "./ClockifyConnectedSections";
import { ClockifyLogo } from "./ClockifyLogo";

export function ClockifyIntegrationCard() {
  const config = useAppConfig();
  const { projects, reload: reloadProjects } = useProjects();
  const { categories, reload: reloadCategories } = useCategories();
  const [connected, setConnected] = useState(false);
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [showConnectModal, setShowConnectModal] = useState(false);
  const { startTour, hasSeenTour } = useTour("clockify-detail");
  const { openModal } = useIntegrationsUi();

  useEffect(() => {
    if (!config.isLoaded) return;
    setConnected(!!config.get("clockifyApiKey"));
    setEmail(config.get("clockifyUserEmail"));
  }, [config.isLoaded]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!hasSeenTour) {
      const t = setTimeout(() => startTour(), 400);
      return () => clearTimeout(t);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  function handleConnected() {
    setConnected(true);
    setEmail(config.get("clockifyUserEmail"));
    setShowConnectModal(false);
  }

  async function handleDisconnect() {
    setLoading(true);
    await config.set("clockifyApiKey", "");
    await config.set("clockifyUserEmail", "");
    await config.set("clockifyUserId", "");
    await config.set("clockifyActiveWorkspaceId", "");
    await config.set("clockifyActiveWorkspaceName", "");
    await config.set("clockifyWorkspaceCache", []);
    setConnected(false);
    setEmail("");
    setLoading(false);
  }

  return (
    <>
      <div className="rounded-card border border-border-subtle bg-surface">
        <div
          data-tour="clockify-header"
          className="flex items-start gap-3 px-4 py-3 border-b border-border-subtle rounded-t-card overflow-hidden"
        >
          <div className="mt-0.5 shrink-0">
            <ClockifyLogo size={20} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-semibold text-fg">Clockify</h2>
              <StatusBadge connected={connected} email={email} />
            </div>
            <p className="text-xs text-fg-muted mt-0.5">
              Registre entradas de tempo diretamente no Clockify.
            </p>
          </div>
          <div className="shrink-0 flex items-center gap-2">
            <TourButton onClick={() => startTour()} label="Ver tour da integração" />
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
          <ClockifyConnectedSections
            projects={projects}
            categories={categories}
            reloadProjects={reloadProjects}
            reloadCategories={reloadCategories}
            onShowSendModal={() => openModal("clockify-send")}
            onShowEntriesModal={() => openModal("clockify-entries")}
          />
        )}
      </div>

      {showConnectModal && (
        <ClockifyConnectModal
          onConnected={handleConnected}
          onClose={() => setShowConnectModal(false)}
        />
      )}
    </>
  );
}
