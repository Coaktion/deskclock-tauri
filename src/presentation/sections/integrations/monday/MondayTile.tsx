import { useAppConfig } from "@presentation/contexts/ConfigContext";
import { IntegrationTile } from "../shared";
import { MondayLogo } from "./MondayLogo";

export function MondayTile({ onClick }: { onClick: () => void }) {
  const config = useAppConfig();
  const connected = config.isLoaded && !!config.get("mondayApiKey");
  const email = config.isLoaded ? config.get("mondayUserEmail") : "";
  const workspaceName = config.isLoaded ? config.get("mondayActiveWorkspaceName") : "";

  return (
    <IntegrationTile
      onClick={onClick}
      logo={<MondayLogo size={20} />}
      name="Monday"
      description="Registre horas como atividades nos boards do Monday"
      connected={connected}
      email={email}
      subBadges={connected && workspaceName ? [{ label: workspaceName, active: true }] : undefined}
    />
  );
}
