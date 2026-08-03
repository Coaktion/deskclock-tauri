import { useState } from "react";
import { X, ExternalLink, Loader2, KeyRound } from "lucide-react";
import { useAppConfig } from "@presentation/contexts/ConfigContext";
import { useIntegrations } from "@presentation/contexts/IntegrationsContext";
import { MondayAuthError } from "@infra/integrations/monday/errors";
import { useEscapeToClose } from "@presentation/hooks/useEscapeToClose";

interface MondayConnectModalProps {
  onConnected: () => void;
  onClose: () => void;
}

export function MondayConnectModal({ onConnected, onClose }: MondayConnectModalProps) {
  const config = useAppConfig();
  const factories = useIntegrations();
  const [apiKey, setApiKey] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEscapeToClose(onClose);

  async function handleConnect() {
    const key = apiKey.trim();
    if (!key) return;

    setLoading(true);
    setError(null);

    try {
      const client = factories.createMondayApi(key);
      const user = await client.getMe();
      await config.set("mondayApiKey", key);
      await config.set("mondayUserId", user.id);
      await config.set("mondayUserName", user.name);
      await config.set("mondayUserEmail", user.email);

      const workspaces = await client.listWorkspaces();
      await config.set("mondayWorkspaceCache", workspaces);
      const first = workspaces[0];
      if (first && !config.get("mondayActiveWorkspaceId")) {
        await config.set("mondayActiveWorkspaceId", first.id);
        await config.set("mondayActiveWorkspaceName", first.name);
      }
      onConnected();
    } catch (err) {
      if (err instanceof MondayAuthError) {
        setError("Token inválido. Verifique e tente novamente.");
      } else {
        setError(err instanceof Error ? err.message : "Erro ao conectar com o Monday.");
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-md bg-gray-900 border border-gray-700 rounded-xl shadow-xl">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-800">
          <h2 className="text-sm font-semibold text-gray-100">Conectar ao Monday</h2>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-300 transition-colors">
            <X size={16} />
          </button>
        </div>

        <div className="px-5 py-4 space-y-4">
          <div className="rounded-lg bg-gray-800/60 border border-gray-700/50 px-4 py-3 space-y-2">
            <p className="text-xs font-medium text-gray-300">Como gerar seu token:</p>
            <ol className="text-xs text-gray-400 space-y-1 list-decimal list-inside">
              <li>
                Acesse{" "}
                <a
                  href="https://auth.monday.com/users/sign_in"
                  target="_blank"
                  rel="noreferrer"
                  className="text-blue-400 hover:text-blue-300 inline-flex items-center gap-0.5"
                >
                  Monday → avatar → Developers
                  <ExternalLink size={10} className="shrink-0" />
                </a>
              </li>
              <li>
                Abra <strong className="text-gray-300">My access tokens</strong>
              </li>
              <li>
                Clique em <strong className="text-gray-300">Show</strong> e copie o token pessoal
              </li>
            </ol>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs text-gray-400" htmlFor="monday-api-key">
              Token da API
            </label>
            <div className="relative">
              <KeyRound
                size={13}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500"
              />
              <input
                id="monday-api-key"
                type="password"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && !loading && handleConnect()}
                placeholder="Cole seu token aqui"
                className="w-full pl-8 pr-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-xs text-gray-200 placeholder-gray-600 focus:outline-none focus:border-blue-500"
                autoFocus
              />
            </div>
          </div>

          {error && <p className="text-xs text-red-400">{error}</p>}
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
