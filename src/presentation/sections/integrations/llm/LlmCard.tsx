import { useEffect, useState } from "react";
import { LogIn, LogOut } from "lucide-react";
import { useAppConfig } from "@presentation/contexts/ConfigContext";
import { findLlmProvider } from "@infra/integrations/llm/providers";
import { LlmConnectModal } from "@presentation/modals/LlmConnectModal";
import { Button } from "@presentation/components/ui";
import { Row, StatusBadge } from "../shared";
import { LlmLogo } from "./LlmLogo";
import { isLlmConnected } from "./llmConnection";
import { buildLlmQuotaView, type LlmQuotaView } from "./llmQuota";

export function LlmIntegrationCard() {
  const config = useAppConfig();
  const [providerId, setProviderId] = useState("");
  const [baseUrl, setBaseUrl] = useState("");
  const [model, setModel] = useState("");
  const [loading, setLoading] = useState(false);
  const [showConnectModal, setShowConnectModal] = useState(false);
  const [quota, setQuota] = useState<LlmQuotaView | null>(null);

  // O cache do ConfigContext é um `useRef` e o `set` não dispara render — lendo
  // direto, a conexão recém-feita só apareceria ao sair e voltar da tela.
  function hydrate() {
    setProviderId(config.get("llmProviderId"));
    setBaseUrl(config.get("llmBaseUrl"));
    setModel(config.get("llmModel"));
    setQuota(buildLlmQuotaView(config.get("llmLastLimits"), config.get("llmLastLimitsAt")));
  }

  useEffect(() => {
    if (!config.isLoaded) return;
    hydrate();
  }, [config.isLoaded]); // eslint-disable-line react-hooks/exhaustive-deps

  const connected = isLlmConnected(baseUrl, model);
  const providerLabel = findLlmProvider(providerId)?.label ?? providerId;

  function handleConnected() {
    hydrate();
    setShowConnectModal(false);
  }

  /**
   * Desconectar apaga **a chave**. O modelo vai junto porque é ele que responde
   * pelo estado (`isLlmConnected`) — sem a chave, o modelo escolhido é um destino
   * que não atende mais, e mantê-lo deixaria o card afirmando conexão.
   *
   * **Provedor e URL ficam**: são a escolha do usuário, e é o que faz reconectar
   * custar colar a chave de novo em vez de remontar a configuração inteira.
   */
  async function handleDisconnect() {
    setLoading(true);
    await config.set("llmApiKey", "");
    await config.set("llmModel", "");
    setModel("");
    setLoading(false);
  }

  return (
    <>
      <div className="rounded-card border border-border-subtle bg-surface">
        <div className="flex items-start gap-3 px-4 py-3 border-b border-border-subtle rounded-t-card overflow-hidden">
          <div className="mt-0.5 shrink-0">
            <LlmLogo size={20} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-semibold text-fg">Provedor de IA</h2>
              <StatusBadge connected={connected} email={connected ? providerLabel : ""} />
            </div>
            <p className="text-xs text-fg-muted mt-0.5">
              Gere o resumo do seu dia com o provedor de LLM que você preferir.
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

        {connected && quota && <QuotaBlock quota={quota} />}

        {connected && (
          <div className="border-t border-border-subtle px-4 py-1">
            <Row label="Provedor">
              <span className="text-sm text-fg">{providerLabel}</span>
            </Row>
            <Row label="Modelo">
              <span className="text-sm font-mono tabular-nums text-fg">{model}</span>
            </Row>
            <Row label="URL base">
              <span className="text-xs text-fg-muted truncate max-w-[280px]" title={baseUrl}>
                {baseUrl}
              </span>
            </Row>
            <Row label="Configuração">
              <Button onClick={() => setShowConnectModal(true)}>Trocar provedor…</Button>
            </Row>
          </div>
        )}
      </div>

      {showConnectModal && (
        <LlmConnectModal onConnected={handleConnected} onClose={() => setShowConnectModal(false)} />
      )}
    </>
  );
}

/**
 * Quanto resta da cota, como o provedor a informou na última chamada.
 *
 * **A janela de cada balde não é escrita**: os mesmos cabeçalhos medem o dia num
 * provedor e o minuto noutro (§ `docs-internal/integracoes/llm.md`). O que a
 * tela escreve são os números que vieram e o texto de renovação do próprio
 * provedor — e de quando é a medição, porque ela é sempre uma foto: a cota só se
 * conhece fazendo uma chamada, e a última foi a do último resumo gerado.
 */
function QuotaBlock({ quota }: { quota: LlmQuotaView }) {
  return (
    <div className="px-4 py-3">
      <p className="text-overline uppercase text-fg-muted">Cota do provedor</p>
      <ul className="mt-2 space-y-1">
        {quota.lines.map((line) => (
          <li key={line.id} className="text-sm text-fg-secondary">
            <span className="font-mono tabular-nums text-fg">{line.amount}</span> {line.noun}
            {line.renewsIn && (
              <>
                {" · renova em "}
                <span className="font-mono tabular-nums">{line.renewsIn}</span>
              </>
            )}
          </li>
        ))}
      </ul>
      <p className={`text-xs mt-2 ${quota.stale ? "text-warning" : "text-fg-muted"}`}>
        Medido {quota.measuredAgo}
        {quota.stale && " · pode já ter renovado"}
      </p>
    </div>
  );
}
