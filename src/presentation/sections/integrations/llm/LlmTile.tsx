import { useAppConfig } from "@presentation/contexts/ConfigContext";
import { findLlmProvider } from "@infra/integrations/llm/providers";
import { IntegrationTile } from "../shared";
import { LlmLogo } from "./LlmLogo";
import { isLlmConnected } from "./llmConnection";

export function LlmTile({ onClick }: { onClick: () => void }) {
  const config = useAppConfig();
  const baseUrl = config.isLoaded ? config.get("llmBaseUrl") : "";
  const model = config.isLoaded ? config.get("llmModel") : "";
  const providerId = config.isLoaded ? config.get("llmProviderId") : "";
  const connected = isLlmConnected(baseUrl, model);
  const providerLabel = findLlmProvider(providerId)?.label ?? providerId;

  return (
    <IntegrationTile
      onClick={onClick}
      logo={<LlmLogo size={20} />}
      name="Provedor de IA"
      description="Gere o resumo do dia com o provedor que você preferir"
      connected={connected}
      email={connected ? providerLabel : ""}
      subBadges={connected && model ? [{ label: model, active: true }] : undefined}
    />
  );
}
