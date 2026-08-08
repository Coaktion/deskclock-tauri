import { useState } from "react";
import { ExternalLink, KeyRound } from "lucide-react";
import { useAppConfig } from "@presentation/contexts/ConfigContext";
import { useIntegrations } from "@presentation/contexts/IntegrationsContext";
import { ClockifyAuthError } from "@infra/integrations/clockify/errors";
import { Button, Input, Modal } from "@presentation/components/ui";
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
    <Modal
      title="Conectar ao Clockify"
      onClose={onClose}
      onKeyDown={handleKeyDown}
      bodyClassName="flex flex-col gap-4"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            variant="primary"
            onClick={handleConnect}
            disabled={!apiKey.trim()}
            loading={loading}
          >
            {loading ? "Validando…" : "Validar e conectar"}
          </Button>
        </>
      }
    >
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
          <KeyRound size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-fg-muted" />
          <Input
            id="clockify-api-key"
            type="password"
            size="sm"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder="Cole sua API Key aqui"
            className="pl-8"
            autoFocus
          />
        </div>
      </div>

      {error && <p className="text-xs text-danger">{error}</p>}
    </Modal>
  );
}
