import { useState } from "react";
import { X, ExternalLink, Loader2, KeyRound } from "lucide-react";
import { useAppConfig } from "@presentation/contexts/ConfigContext";
import { useIntegrations } from "@presentation/contexts/IntegrationsContext";
import { ClockifyAuthError } from "@infra/integrations/clockify/errors";
import { useEscapeToClose } from "@presentation/hooks/useEscapeToClose";
import { useSubmitOnEnter } from "@presentation/hooks/useSubmitOnEnter";

interface ClockifyConnectModalProps {
  onConnected: () => void;
  onClose: () => void;
}

export function ClockifyConnectModal({ onConnected, onClose }: ClockifyConnectModalProps) {
  const config = useAppConfig();
  const factories = useIntegrations();
  const [apiKey, setApiKey] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEscapeToClose(onClose);
  const handleKeyDown = useSubmitOnEnter(() => void handleConnect(), { disabled: loading });

  async function handleConnect() {
    const key = apiKey.trim();
    if (!key) return;

    setLoading(true);
    setError(null);

    try {
      const client = factories.createClockifyApi(key);
      const user = await client.getUser();
      await config.set("clockifyApiKey", key);
      await config.set("clockifyUserEmail", user.email);
      await config.set("clockifyUserId", user.id);
      await config.set("clockifyActiveWorkspaceId", user.defaultWorkspace);
      const workspaces = await client.listWorkspaces();
      const active = workspaces.find((w) => w.id === user.defaultWorkspace);
      if (active) await config.set("clockifyActiveWorkspaceName", active.name);
      await config.set("clockifyWorkspaceCache", workspaces);
      onConnected();
    } catch (err) {
      if (err instanceof ClockifyAuthError) {
        setError("Chave inválida. Verifique e tente novamente.");
      } else {
        setError(err instanceof Error ? err.message : "Erro ao conectar com o Clockify.");
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div
        onKeyDown={handleKeyDown}
        className="w-full max-w-md bg-surface border border-border rounded-card shadow-xl"
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-border-subtle">
          <h2 className="text-sm font-semibold text-fg">Conectar ao Clockify</h2>
          <button
            onClick={onClose}
            className="text-fg-muted hover:text-fg-secondary transition-colors"
          >
            <X size={16} />
          </button>
        </div>

        <div className="px-5 py-4 space-y-4">
          <div className="rounded-control bg-raised/60 border border-border/50 px-4 py-3 space-y-2">
            <p className="text-xs font-medium text-fg-secondary">Como gerar sua API Key:</p>
            <ol className="text-xs text-fg-secondary space-y-1 list-decimal list-inside">
              <li>
                Acesse{" "}
                <a
                  href="https://app.clockify.me/user/preferences#advanced"
                  target="_blank"
                  rel="noreferrer"
                  className="text-accent-text hover:text-fg inline-flex items-center gap-0.5"
                >
                  Clockify → Preferências → Avançado
                  <ExternalLink size={14} className="shrink-0" />
                </a>
              </li>
              <li>
                Role até a seção <strong className="text-fg-secondary">API</strong>
              </li>
              <li>
                Clique em <strong className="text-fg-secondary">Generate</strong> e copie a chave
              </li>
            </ol>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs text-fg-secondary" htmlFor="clockify-api-key">
              API Key
            </label>
            <div className="relative">
              <KeyRound
                size={14}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-fg-muted"
              />
              <input
                id="clockify-api-key"
                type="password"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="Cole sua API Key aqui"
                autoComplete="off"
                className="w-full pl-8 pr-3 py-2 bg-raised border border-border rounded-control text-xs text-fg placeholder-fg-muted focus:outline-none focus:border-accent"
                autoFocus
              />
            </div>
          </div>

          {error && <p className="text-xs text-danger">{error}</p>}
        </div>

        <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-border-subtle">
          <button
            onClick={onClose}
            className="px-3 py-1.5 text-xs text-fg-secondary hover:text-fg transition-colors"
          >
            Cancelar
          </button>
          <button
            onClick={handleConnect}
            disabled={loading || !apiKey.trim()}
            className="flex items-center gap-1.5 px-4 py-1.5 text-xs bg-accent hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-control transition"
          >
            {loading && <Loader2 size={14} className="animate-spin" />}
            {loading ? "Validando…" : "Validar e conectar"}
          </button>
        </div>
      </div>
    </div>
  );
}
