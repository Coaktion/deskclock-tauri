import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useAppConfig } from "@presentation/contexts/ConfigContext";
import { AlertCircle, ExternalLink } from "lucide-react";
import { SectionCard, SectionRow, Toggle } from "@presentation/components/ui";
import { NumberInputWithCommit } from "./SettingsShared";

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
    <div className="space-y-3">
      <SectionCard title="API local" divided>
        <SectionRow>
          <Toggle
            label="Ativar API REST local"
            description="Permite controlar o DeskClock via requisições HTTP de ferramentas externas (scripts, Alfred, Raycast, n8n…)"
            checked={localApiEnabled}
            onChange={handleLocalApiToggle}
            disabled={localApiLoading !== null}
          />
        </SectionRow>

        {localApiEnabled && !localApiLoading && (
          <SectionRow className="space-y-1.5">
            <div>
              <p className="text-sm text-fg">Porta</p>
              <p className="text-xs text-fg-muted mt-0.5">
                Entre 1024 e 65535. Alterações reiniciam o servidor.
              </p>
            </div>
            <NumberInputWithCommit
              label=""
              min={1024}
              max={65535}
              committed={localApiPort}
              onCommit={handlePortCommit}
              inputClassName="w-32 font-mono tabular-nums"
            />
          </SectionRow>
        )}

        <SectionRow>
          <div className="flex items-center gap-2.5">
            <span
              className={`w-2 h-2 rounded-full shrink-0 ${
                localApiLoading
                  ? "bg-paused animate-pulse"
                  : localApiStatus?.running
                    ? "bg-billable"
                    : localApiStatus?.error
                      ? "bg-danger"
                      : "bg-fg-muted"
              }`}
            />
            <span className="text-xs text-fg-secondary">
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
                className="flex items-center gap-1 text-xs text-accent-text hover:opacity-80 transition-opacity ml-auto"
              >
                <ExternalLink size={14} />
                Swagger
              </a>
            )}
          </div>
        </SectionRow>
      </SectionCard>

      {localApiStatus?.error && !localApiLoading && (
        <div className="flex items-start gap-2 rounded-control bg-danger/10 border border-danger/30 px-3 py-2.5">
          <AlertCircle size={14} className="text-danger mt-0.5 shrink-0" />
          <p className="text-xs text-danger">{localApiStatus.error}</p>
        </div>
      )}
    </div>
  );
}
