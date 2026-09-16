import { useAppConfig } from "@presentation/contexts/ConfigContext";
import { useIntegrationsUi } from "@presentation/contexts/IntegrationsUiContext";
import { useTour } from "@presentation/hooks/useTour";
import { startZendeskOAuth } from "@infra/integrations/zendesk/ZendeskOAuth";
import { ZendeskTokenManager } from "@infra/integrations/zendesk/ZendeskTokenManager";
import { CalendarDays, Key, LogIn, LogOut } from "lucide-react";
import { useEffect, useState } from "react";
import { Button, Input, TourButton } from "@presentation/components/ui";
import { DeskclockWorkspaceRow, IntegrationTile, Row, StatusBadge, SubSection } from "./shared";
import { ZendeskLogoSmall } from "./zendesk/ZendeskLogo";

/* ── Card Zendesk ── */

export function ZendeskIntegrationCard() {
  const config = useAppConfig();
  const { openModal } = useIntegrationsUi();
  const [connected, setConnected] = useState(false);
  const [email, setEmail] = useState("");
  const [subdomain, setSubdomain] = useState("");
  const [clientId, setClientId] = useState("");
  const [clientSecret, setClientSecret] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { startTour, hasSeenTour } = useTour("zendesk-detail");

  useEffect(() => {
    if (!config.isLoaded) return;
    setConnected(!!config.get("zendeskAccessToken"));
    setEmail(config.get("zendeskUserEmail"));
    setSubdomain(config.get("zendeskSubdomain"));
    setClientId(config.get("zendeskClientId"));
    setClientSecret(config.get("zendeskClientSecret"));
  }, [config.isLoaded]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!hasSeenTour) {
      const t = setTimeout(() => startTour(), 400);
      return () => clearTimeout(t);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleConnect() {
    if (!subdomain.trim()) {
      setError("Informe o subdomínio do seu Zendesk.");
      return;
    }
    if (!clientId.trim()) {
      setError("Informe o Client ID do OAuth client.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      await config.set("zendeskSubdomain", subdomain.trim());
      await config.set("zendeskClientId", clientId.trim());
      await config.set("zendeskClientSecret", clientSecret.trim());
      const tokens = await startZendeskOAuth(
        subdomain.trim(),
        clientId.trim(),
        clientSecret.trim()
      );
      const manager = new ZendeskTokenManager(config, subdomain.trim());
      await manager.saveTokens(tokens);
      setConnected(true);
      setEmail(tokens.email);
    } catch (err) {
      // O `invoke` do Tauri rejeita com string, não com Error: sem isto o motivo real sumia.
      setError(
        err instanceof Error
          ? err.message
          : typeof err === "string" && err
            ? err
            : "Erro ao conectar com o Zendesk."
      );
    } finally {
      setLoading(false);
    }
  }

  async function handleDisconnect() {
    const manager = new ZendeskTokenManager(config, subdomain);
    await manager.clearTokens();
    setConnected(false);
    setEmail("");
  }

  return (
    <div className="rounded-card border border-border-subtle bg-surface overflow-hidden">
      {/* Header do card */}
      <div
        data-tour="zendesk-header"
        className="flex items-start gap-3 px-4 py-3 border-b border-border-subtle"
      >
        <div className="mt-0.5 shrink-0">
          <ZendeskLogoSmall size={20} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-semibold text-fg">Zendesk</h2>
            <StatusBadge connected={connected} email={email} />
          </div>
          <p className="text-xs text-fg-muted mt-0.5">
            Importe tickets atribuídos a você como tarefas planejadas.
          </p>
        </div>
        <div className="shrink-0 flex items-center gap-2">
          {error && <span className="text-xs text-danger max-w-[180px] text-right">{error}</span>}
          <TourButton onClick={() => startTour()} label="Ver tour da integração" />
          {connected ? (
            <Button onClick={handleDisconnect} icon={<LogOut size={14} />}>
              Desconectar
            </Button>
          ) : (
            <Button
              variant="primary"
              onClick={handleConnect}
              loading={loading}
              icon={<LogIn size={14} />}
            >
              {loading ? "Aguardando…" : "Conectar"}
            </Button>
          )}
        </div>
      </div>

      {/* Credenciais OAuth */}
      <div data-tour="zendesk-credentials">
        <SubSection icon={<Key size={14} />} title="Credenciais OAuth" defaultOpen={!connected}>
          {!connected && (
            <div className="rounded-control bg-raised border border-border px-4 py-3 space-y-2 mb-1">
              <p className="text-sm font-medium text-fg-secondary">
                Como criar um OAuth client no Zendesk:
              </p>
              <ol className="text-body text-fg-muted space-y-1 list-decimal list-inside">
                <li>
                  Acesse{" "}
                  <span className="text-fg-secondary font-medium">
                    Admin Center → Apps e integrações → APIs → APIs do Zendesk → Clientes OAuth
                  </span>
                </li>
                <li>
                  Clique em{" "}
                  <span className="text-fg-secondary font-medium">Adicionar cliente OAuth</span>
                </li>
                <li>
                  Em <span className="text-fg-secondary font-medium">URLs de redirecionamento</span>
                  , adicione exatamente:{" "}
                  <code className="text-accent-text font-mono">
                    http://localhost:27422/callback
                  </code>
                </li>
                <li>
                  Copie o <span className="text-fg-secondary font-medium">Identificador único</span>{" "}
                  (Client ID) e o <span className="text-fg-secondary font-medium">Secret</span>{" "}
                  gerado
                </li>
              </ol>
            </div>
          )}
          <Row label="Subdomínio">
            <div className="flex items-center gap-1.5">
              <Input
                size="sm"
                value={subdomain}
                onChange={(e) => setSubdomain(e.target.value)}
                disabled={connected}
                placeholder="minha-empresa"
                className="w-36"
              />
              <span className="text-sm text-fg-muted shrink-0">.zendesk.com</span>
            </div>
          </Row>
          <Row label="Client ID">
            <Input
              size="sm"
              value={clientId}
              onChange={(e) => setClientId(e.target.value)}
              disabled={connected}
              placeholder="OAuth client identifier"
              className="w-52"
            />
          </Row>
          <Row label="Secret">
            <Input
              type="password"
              size="sm"
              value={clientSecret}
              onChange={(e) => setClientSecret(e.target.value)}
              disabled={connected}
              placeholder="Vazio para cliente público"
              className="w-52"
            />
          </Row>
        </SubSection>
      </div>
      {/* /zendesk-credentials */}

      {/* Importar tickets */}
      {connected && (
        <SubSection icon={<CalendarDays size={14} />} title="Importar tickets" defaultOpen>
          <div className="pt-1">
            <DeskclockWorkspaceRow
              configKey="zendeskDeskclockWorkspaceId"
              hint="Onde os tickets importados viram tarefas planejadas."
              className="pb-2.5 mb-3 border-b border-border-subtle"
            />
            <p className="text-sm text-fg-muted mb-3">
              Importe tickets abertos atribuídos a você como tarefas planejadas.
            </p>
            <Button
              onClick={() => openModal("zendesk-import")}
              icon={<CalendarDays size={14} />}
              className="w-full"
            >
              Importar tickets…
            </Button>
          </div>
        </SubSection>
      )}
    </div>
  );
}

export function ZendeskTile({ onClick }: { onClick: () => void }) {
  const config = useAppConfig();
  const connected = config.isLoaded && !!config.get("zendeskAccessToken");
  const email = config.isLoaded ? config.get("zendeskUserEmail") : "";
  const subdomain = config.isLoaded ? config.get("zendeskSubdomain") : "";

  return (
    <IntegrationTile
      onClick={onClick}
      logo={<ZendeskLogoSmall size={20} />}
      name="Zendesk"
      description="Importe tickets como tarefas planejadas"
      connected={connected}
      email={email || (subdomain ? `${subdomain}.zendesk.com` : undefined)}
    />
  );
}
