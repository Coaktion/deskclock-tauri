import { useState } from "react";
import { X, ExternalLink, Loader2, KeyRound } from "lucide-react";
import { useAppConfig } from "@presentation/contexts/ConfigContext";
import { ClockifyClient } from "@infra/integrations/clockify/ClockifyClient";
import { ClockifyAuthError } from "@infra/integrations/clockify/errors";

interface ClockifyConnectModalProps {
  onConnected: () => void;
  onClose: () => void;
}

export function ClockifyConnectModal({ onConnected, onClose }: ClockifyConnectModalProps) {
  const config = useAppConfig();
  const [apiKey, setApiKey] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleConnect() {
    const key = apiKey.trim();
    if (!key) return;

    setLoading(true);
    setError(null);

    try {
      const client = new ClockifyClient(key);
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
      <div className="w-full max-w-md bg-gray-900 border border-gray-700 rounded-xl shadow-xl">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-800">
          <h2 className="text-sm font-semibold text-gray-100">Conectar ao Clockify</h2>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-300 transition-colors">
            <X size={16} />
          </button>
        </div>

        <div className="px-5 py-4 space-y-4">
          <div className="rounded-lg bg-gray-800/60 border border-gray-700/50 px-4 py-3 space-y-2">
            <p className="text-xs font-medium text-gray-300">Como gerar sua API Key:</p>
            <ol className="text-xs text-gray-400 space-y-1 list-decimal list-inside">
              <li>
                Acesse{" "}
                <a
                  href="https://app.clockify.me/user/preferences#advanced"
                  target="_blank"
                  rel="noreferrer"
                  className="text-blue-400 hover:text-blue-300 inline-flex items-center gap-0.5"
                >
                  Clockify → Preferências → Avançado
                  <ExternalLink size={10} className="shrink-0" />
                </a>
              </li>
              <li>Role até a seção <strong className="text-gray-300">API</strong></li>
              <li>Clique em <strong className="text-gray-300">Generate</strong> e copie a chave</li>
            </ol>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs text-gray-400" htmlFor="clockify-api-key">
              API Key
            </label>
            <div className="relative">
              <KeyRound size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
              <input
                id="clockify-api-key"
                type="password"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && !loading && handleConnect()}
                placeholder="Cole sua API Key aqui"
                className="w-full pl-8 pr-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-xs text-gray-200 placeholder-gray-600 focus:outline-none focus:border-blue-500"
                autoFocus
              />
            </div>
          </div>

          {error && (
            <p className="text-xs text-red-400">{error}</p>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-gray-800">
          <button
            onClick={onClose}
            className="px-3 py-1.5 text-xs text-gray-400 hover:text-gray-200 transition-colors"
          >
            Cancelar
          </button>
          <button
            onClick={handleConnect}
            disabled={loading || !apiKey.trim()}
            className="flex items-center gap-1.5 px-4 py-1.5 text-xs bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg transition-colors"
          >
            {loading && <Loader2 size={12} className="animate-spin" />}
            {loading ? "Validando…" : "Validar e conectar"}
          </button>
        </div>
      </div>
    </div>
  );
}
