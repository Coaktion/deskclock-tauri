import { useAppConfig } from "@presentation/contexts/ConfigContext";
import { IntegrationTile } from "../shared";
import { ClockifyLogo } from "./ClockifyLogo";

export function ClockifyTile({ onClick }: { onClick: () => void }) {
  const config = useAppConfig();
  const connected = config.isLoaded && !!config.get("clockifyApiKey");
  const email = config.isLoaded ? config.get("clockifyUserEmail") : "";
  const workspaceName = config.isLoaded ? config.get("clockifyActiveWorkspaceName") : "";

  return (
    <IntegrationTile
      onClick={onClick}
      logo={<ClockifyLogo size={20} />}
      name="Clockify"
      description="Registre entradas de tempo no Clockify"
      connected={connected}
      email={email}
      subBadges={connected && workspaceName ? [{ label: workspaceName, active: true }] : undefined}
    />
  );
}
