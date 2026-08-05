import { useAppConfig } from "@presentation/contexts/ConfigContext";
import { IntegrationTile } from "../shared";
import { MondayLogo } from "./MondayLogo";

export function MondayTile({ onClick }: { onClick: () => void }) {
  const config = useAppConfig();
  const connected = config.isLoaded && !!config.get("mondayApiKey");
  const email = config.isLoaded ? config.get("mondayUserEmail") : "";
  // Quantos projetos já sobem horas. Substituiu o nome do workspace do Monday,
  // que deixou de existir como escolha — e dizia menos: o que interessa saber de
  // relance é se o Portfólio já foi lido.
  const withBoard = config.isLoaded
    ? config.get("mondayProjectMapping").filter((m) => !!m.mondayBoardId).length
    : 0;

  return (
    <IntegrationTile
      onClick={onClick}
      logo={<MondayLogo size={20} />}
      name="Monday"
      description="Registre horas como atividades nos boards do Monday"
      connected={connected}
      email={email}
      subBadges={
        connected && withBoard > 0 ? [{ label: `${withBoard} projetos`, active: true }] : undefined
      }
    />
  );
}
