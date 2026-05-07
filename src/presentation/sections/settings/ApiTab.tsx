import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useAppConfig } from "@presentation/contexts/ConfigContext";
import { AlertCircle, ExternalLink } from "lucide-react";
import { ToggleRow, NumberInputWithCommit, SettingsCard, CardRow } from "./SettingsShared";

interface ApiStatus {
  running: boolean;
  port: number | null;
  error: string | null;
}

export function ApiTab() {
  const config = useAppConfig();

  const [localApiEnabled, setLocalApiEnabled] = useState(false);
  const [localApiPort, setLocalApiPort] = useState(27420);
  const [localApiStatus, setLocalApiStatus] = useState<ApiStatus | null>(null);
  const [localApiLoading, setLocalApiLoading] = useState<"starting" | "stopping" | null>(null);

  useEffect(() => {
    if (!config.isLoaded) return;
    setLocalApiEnabled(config.get("localApiEnabled"));
    setLocalApiPort(config.get("localApiPort"));
    invoke<ApiStatus>("get_local_api_status")
      .then(setLocalApiStatus)
      .catch(() => {});
  }, [config.isLoaded]); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleLocalApiToggle(enabled: boolean) {
    setLocalApiEnabled(enabled);
    await config.set("localApiEnabled", enabled);
    if (enabled) {
      setLocalApiLoading("starting");
      try {
        await invoke("start_local_api", { port: localApiPort });
        setLocalApiStatus({ running: true, port: localApiPort, error: null });
      } catch (e) {
        setLocalApiEnabled(false);
        await config.set("localApiEnabled", false);
        setLocalApiStatus({ running: false, port: null, error: String(e) });
      } finally {
        setLocalApiLoading(null);
      }
    } else {
      setLocalApiLoading("stopping");
      try {
        await invoke("stop_local_api");
        setLocalApiStatus({ running: false, port: null, error: null });
      } finally {
        setLocalApiLoading(null);
      }
    }
  }

  async function handlePortCommit(port: number) {
    setLocalApiPort(port);
    await config.set("localApiPort", port);
    if (localApiEnabled) {
      setLocalApiLoading("starting");
      try {
        await invoke("start_local_api", { port });
        setLocalApiStatus({ running: true, port, error: null });
      } catch (e) {
        setLocalApiStatus({ running: false, port: null, error: String(e) });
      } finally {
        setLocalApiLoading(null);
      }
    }
  }

  return (
    <div className="space-y-4">
      <SettingsCard>
        <CardRow>
          <ToggleRow
            label="Ativar API REST local"
            description="Permite controlar o DeskClock via requisições HTTP de ferramentas externas (scripts, Alfred, Raycast, n8n…)"
            value={localApiEnabled}
            onChange={handleLocalApiToggle}
            disabled={localApiLoading !== null}
          />
        </CardRow>

        {localApiEnabled && !localApiLoading && (
          <CardRow>
            <div className="space-y-1.5">
              <div>
                <p className="text-sm text-gray-200">Porta</p>
                <p className="text-xs text-gray-500 mt-0.5">
                  Entre 1024 e 65535. Alterações reiniciam o servidor.
                </p>
              </div>
              <NumberInputWithCommit
                label=""
                min={1024}
                max={65535}
                committed={localApiPort}
                onCommit={handlePortCommit}
                inputClassName="w-32 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-200 focus:outline-none focus:border-blue-500 tabular-nums"
              />
            </div>
          </CardRow>
        )}

        <CardRow>
          <div className="flex items-center gap-2.5">
            <span
              className={`w-2 h-2 rounded-full shrink-0 ${
                localApiLoading
                  ? "bg-yellow-400 animate-pulse"
                  : localApiStatus?.running
                    ? "bg-green-400"
                    : localApiStatus?.error
                      ? "bg-red-500"
                      : "bg-gray-600"
              }`}
            />
            <span className="text-xs text-gray-400">
              {localApiLoading === "starting"
                ? "Iniciando…"
                : localApiLoading === "stopping"
                  ? "Parando…"
                  : localApiStatus?.running
                    ? `Ativo na porta ${localApiStatus.port}`
                    : localApiStatus?.error
                      ? "Erro ao iniciar"
                      : "Desativado"}
            </span>
            {localApiStatus?.running && !localApiLoading && (
              <a
                href={`http://localhost:${localApiStatus.port}/docs`}
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-1 text-xs text-blue-400 hover:text-blue-300 transition-colors ml-auto"
              >
                <ExternalLink size={11} />
                Swagger
              </a>
            )}
          </div>
        </CardRow>
      </SettingsCard>

      {localApiStatus?.error && !localApiLoading && (
        <div className="flex items-start gap-2 rounded-lg bg-red-950/40 border border-red-800/50 px-3 py-2.5">
          <AlertCircle size={14} className="text-red-400 mt-0.5 shrink-0" />
          <p className="text-xs text-red-300">{localApiStatus.error}</p>
        </div>
      )}
    </div>
  );
}
