import { useRepositories } from "@presentation/contexts/RepositoriesContext";
import { useAppConfig } from "@presentation/contexts/ConfigContext";
import { useIntegrations } from "@presentation/contexts/IntegrationsContext";
import { useIntegrationCatalogs } from "@presentation/hooks/useIntegrationCatalogs";
import { useTour } from "@presentation/hooks/useTour";
import { startZendeskOAuth } from "@infra/integrations/zendesk/ZendeskOAuth";
import { ZendeskTokenManager } from "@infra/integrations/zendesk/ZendeskTokenManager";
import { ImportZendeskModal } from "@presentation/modals/ImportZendeskModal";
import { CalendarDays, CheckCircle2, Key, Loader2, LogIn, LogOut, X } from "lucide-react";
import { useEffect, useState } from "react";
import { DeskclockWorkspaceRow, IntegrationTile, Row, StatusBadge, SubSection } from "./shared";

/* ── SVG Zendesk ── */

export function ZendeskLogoSmall({ size = 20 }: { size?: number }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 26 26"
      aria-hidden="true"
      className="zendesk-logo"
    >
      <path
        fill="currentColor"
        d="M12 8.2v14.5H0zM12 3c0 3.3-2.7 6-6 6S0 6.3 0 3h12zm2 19.7c0-3.3 2.7-6 6-6s6 2.7 6 6H14zm0-5.2V3h12z"
      />
    </svg>
  );
}

/* ── Card Zendesk ── */

export function ZendeskIntegrationCard() {
  const { plannedTaskRepo } = useRepositories();
  const config = useAppConfig();
  const factories = useIntegrations();
  // Catálogos do workspace da integração: o import cria as planejadas lá, e as
  // do ativo fariam a tarefa apontar para projeto de outro workspace.
  const { projects, categories } = useIntegrationCatalogs("zendeskDeskclockWorkspaceId");
  const [connected, setConnected] = useState(false);
  const [email, setEmail] = useState("");
  const [subdomain, setSubdomain] = useState("");
  const [clientId, setClientId] = useState("");
  const [clientSecret, setClientSecret] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showImportModal, setShowImportModal] = useState(false);
  const [importedCount, setImportedCount] = useState<number | null>(null);
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
      setError(err instanceof Error ? err.message : "Erro ao conectar com o Zendesk.");
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

  const ticketImporter = connected ? factories.createTicketImporter() : null;

  return (
    <div className="rounded-xl border border-gray-800 bg-gray-900/50 overflow-hidden">
      {/* Header do card */}
      <div
        data-tour="zendesk-header"
        className="flex items-start gap-3 px-4 py-3 border-b border-gray-800"
      >
        <div className="mt-0.5 shrink-0">
          <ZendeskLogoSmall size={20} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-semibold text-gray-100">Zendesk</h2>
            <StatusBadge connected={connected} email={email} />
          </div>
          <p className="text-xs text-gray-500 mt-0.5">
            Importe tickets atribuídos a você como tarefas planejadas.
          </p>
        </div>
        <div className="shrink-0 flex items-center gap-2">
          {error && <span className="text-xs text-red-400 max-w-[180px] text-right">{error}</span>}
          <button
            onClick={() => startTour()}
            title="Ver tour da integração"
            className="w-5 h-5 shrink-0 rounded-full border border-gray-700 text-gray-600 hover:border-gray-500 hover:text-gray-400 transition-colors text-[11px] font-medium flex items-center justify-center"
          >
            ?
          </button>
          {connected ? (
            <button
              onClick={handleDisconnect}
              className="flex items-center gap-1.5 text-xs bg-gray-800 hover:bg-gray-700 text-gray-300 px-3 py-1.5 rounded transition-colors"
            >
              <LogOut size={12} />
              Desconectar
            </button>
          ) : (
            <button
              onClick={handleConnect}
              disabled={loading}
              className="flex items-center gap-1.5 text-xs bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed text-white px-3 py-1.5 rounded transition-colors"
            >
              {loading ? <Loader2 size={12} className="animate-spin" /> : <LogIn size={12} />}
              {loading ? "Aguardando…" : "Conectar"}
            </button>
          )}
        </div>
      </div>

      {/* Credenciais OAuth */}
      <div data-tour="zendesk-credentials">
        <SubSection icon={<Key size={15} />} title="Credenciais OAuth" defaultOpen={!connected}>
          {!connected && (
            <div className="rounded-lg bg-gray-800/60 border border-gray-700/50 px-4 py-3 space-y-2 mb-1">
              <p className="text-xs font-medium text-gray-300">
                Como criar um OAuth client no Zendesk:
              </p>
              <ol className="text-xs text-gray-400 space-y-1 list-decimal list-inside">
                <li>
                  Acesse{" "}
                  <span className="text-gray-300 font-medium">
                    Admin Center → Apps e integrações → APIs → APIs do Zendesk → Clientes OAuth
                  </span>
                </li>
                <li>
                  Clique em{" "}
                  <span className="text-gray-300 font-medium">Adicionar cliente OAuth</span>
                </li>
                <li>
                  Em <span className="text-gray-300 font-medium">URLs de redirecionamento</span>,
                  adicione exatamente:{" "}
                  <code className="text-blue-400 font-mono text-[11px]">
                    http://localhost:27422/callback
                  </code>
                </li>
                <li>
                  Copie o <span className="text-gray-300 font-medium">Identificador único</span>{" "}
                  (Client ID) e o <span className="text-gray-300 font-medium">Secret</span> gerado
                </li>
              </ol>
            </div>
          )}
          <Row label="Subdomínio">
            <div className="flex items-center gap-1.5">
              <input
                type="text"
                value={subdomain}
                onChange={(e) => setSubdomain(e.target.value)}
                disabled={connected}
                placeholder="minha-empresa"
                className="w-36 bg-gray-800 border border-gray-700 rounded px-2.5 py-1 text-xs text-gray-200 placeholder-gray-600 focus:outline-none focus:border-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
              />
              <span className="text-xs text-gray-600 shrink-0">.zendesk.com</span>
            </div>
          </Row>
          <Row label="Client ID">
            <input
              type="text"
              value={clientId}
              onChange={(e) => setClientId(e.target.value)}
              disabled={connected}
              placeholder="OAuth client identifier"
              className="w-52 bg-gray-800 border border-gray-700 rounded px-2.5 py-1 text-xs text-gray-200 placeholder-gray-600 focus:outline-none focus:border-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
            />
          </Row>
          <Row label="Secret">
            <input
              type="password"
              value={clientSecret}
              onChange={(e) => setClientSecret(e.target.value)}
              disabled={connected}
              placeholder="Vazio para cliente público"
              className="w-52 bg-gray-800 border border-gray-700 rounded px-2.5 py-1 text-xs text-gray-200 placeholder-gray-600 focus:outline-none focus:border-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
            />
          </Row>
        </SubSection>
      </div>
      {/* /zendesk-credentials */}

      {/* Importar tickets */}
      {connected && (
        <SubSection icon={<CalendarDays size={15} />} title="Importar tickets" defaultOpen>
          <div className="pt-1">
            <DeskclockWorkspaceRow
              configKey="zendeskDeskclockWorkspaceId"
              hint="Onde os tickets importados viram tarefas planejadas."
              className="pb-2.5 mb-3 border-b border-gray-800"
            />
            <p className="text-xs text-gray-500 mb-3">
              Importe tickets abertos atribuídos a você como tarefas planejadas.
            </p>
            <button
              onClick={() => {
                setImportedCount(null);
                setShowImportModal(true);
              }}
              className="flex items-center gap-1.5 text-xs bg-gray-800 hover:bg-gray-700 text-gray-300 px-3 py-1.5 rounded transition-colors w-full justify-center border border-gray-700"
            >
              <CalendarDays size={13} />
              Importar tickets…
            </button>

            {importedCount !== null && (
              <div className="mt-2 flex items-center gap-2 px-3 py-2 bg-green-500/10 border border-green-500/20 rounded-lg">
                <CheckCircle2 size={14} className="text-green-400 shrink-0" />
                <span className="text-xs text-green-300 flex-1">
                  {importedCount} ticket{importedCount !== 1 ? "s" : ""} importado
                  {importedCount !== 1 ? "s" : ""}.
                </span>
                <button
                  onClick={() => setImportedCount(null)}
                  className="text-gray-600 hover:text-gray-400 transition-colors"
                >
                  <X size={12} />
                </button>
              </div>
            )}
          </div>
        </SubSection>
      )}

      {showImportModal && ticketImporter && (
        <ImportZendeskModal
          importer={ticketImporter}
          repo={plannedTaskRepo}
          projects={projects}
          categories={categories}
          onImported={(count) => {
            setShowImportModal(false);
            setImportedCount(count);
          }}
          onClose={() => setShowImportModal(false)}
        />
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
