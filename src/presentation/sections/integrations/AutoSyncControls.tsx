import { useAppConfig } from "@presentation/contexts/ConfigContext";
import type { AppConfig } from "@shared/types/appConfig";
import { formatLastSync } from "@shared/utils/time";
import { RefreshCw } from "lucide-react";
import { useEffect, useState } from "react";
import { Row, SubSection, Toggle } from "./shared";

/**
 * Chaves de `AppConfig` que uma integração usa para auto-sync. Cada integração
 * declara as suas — os controles são idênticos, só o destino da persistência muda.
 */
export interface AutoSyncConfigKeys {
  enabled: KeysOfType<boolean>;
  mode: KeysOfType<"per-task" | "daily">;
  trigger: KeysOfType<"on-open" | "fixed-time">;
  time: KeysOfType<string>;
  lastSync: KeysOfType<string>;
}

type KeysOfType<T> = {
  [K in keyof AppConfig]: AppConfig[K] extends T ? K : never;
}[keyof AppConfig];

const MODES = ["per-task", "daily"] as const;
const TRIGGERS = ["on-open", "fixed-time"] as const;

export function AutoSyncControls({ keys }: { keys: AutoSyncConfigKeys }) {
  const config = useAppConfig();
  const [autoSync, setAutoSync] = useState(false);
  const [syncMode, setSyncMode] = useState<"per-task" | "daily">("per-task");
  const [syncTrigger, setSyncTrigger] = useState<"on-open" | "fixed-time">("on-open");
  const [syncTime, setSyncTime] = useState("18:00");
  const [lastSyncTs, setLastSyncTs] = useState("");

  useEffect(() => {
    if (!config.isLoaded) return;
    setAutoSync(config.get(keys.enabled));
    setSyncMode(config.get(keys.mode));
    setSyncTrigger(config.get(keys.trigger));
    setSyncTime(config.get(keys.time));
    setLastSyncTs(config.get(keys.lastSync));
    // Hidratação única: `config` é estável e `keys` é constante por integração;
    // relistar os setters só reexecutaria o efeito sem mudar o resultado.
  }, [config.isLoaded, keys]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <SubSection
      icon={<RefreshCw size={15} />}
      title="Sincronização automática"
      badge={
        autoSync ? (
          <span className="ml-1 text-[10.5px] text-blue-400 font-medium">Ativa</span>
        ) : undefined
      }
    >
      <Row label="Ativar">
        <Toggle
          checked={autoSync}
          onChange={async (v) => {
            setAutoSync(v);
            await config.set(keys.enabled, v);
          }}
        />
      </Row>

      {autoSync && (
        <div className="pl-4 border-l border-gray-800 ml-1 mb-1">
          <div className="py-2.5 border-b border-gray-800">
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-300">Modo</span>
              <div className="flex items-center gap-1 bg-gray-800 rounded p-0.5">
                {MODES.map((m) => (
                  <button
                    key={m}
                    onClick={async () => {
                      setSyncMode(m);
                      await config.set(keys.mode, m);
                    }}
                    className={`px-2.5 py-1 text-xs rounded transition-colors ${
                      syncMode === m
                        ? "bg-blue-600 text-white"
                        : "text-gray-400 hover:text-gray-200"
                    }`}
                  >
                    {m === "per-task" ? "Por tarefa" : "Diário"}
                  </button>
                ))}
              </div>
            </div>
            <p className="text-xs text-gray-500 mt-1.5">
              {syncMode === "per-task"
                ? "Envia cada tarefa automaticamente ao ser concluída."
                : "Agrupa e envia de uma vez, cobrindo fins de semana e dias perdidos."}
            </p>
          </div>

          {syncMode === "daily" && (
            <>
              <div className="py-2.5 border-b border-gray-800">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-300">Gatilho</span>
                  <div className="flex items-center gap-1 bg-gray-800 rounded p-0.5">
                    {TRIGGERS.map((t) => (
                      <button
                        key={t}
                        onClick={async () => {
                          setSyncTrigger(t);
                          await config.set(keys.trigger, t);
                        }}
                        className={`px-2.5 py-1 text-xs rounded transition-colors ${
                          syncTrigger === t
                            ? "bg-blue-600 text-white"
                            : "text-gray-400 hover:text-gray-200"
                        }`}
                      >
                        {t === "on-open" ? "Ao abrir o app" : "Horário fixo"}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {syncTrigger === "fixed-time" && (
                <Row label="Horário">
                  <input
                    type="time"
                    value={syncTime}
                    onChange={(e) => setSyncTime(e.target.value)}
                    onBlur={() => config.set(keys.time, syncTime)}
                    className="bg-gray-800 border border-gray-700 rounded px-2 py-1 text-xs text-gray-200 focus:outline-none focus:border-blue-500"
                  />
                </Row>
              )}

              <div className="py-2.5 flex items-center justify-between gap-3">
                <span className="text-xs text-gray-500 shrink-0">
                  Último envio:{" "}
                  <span className="text-gray-300">
                    {lastSyncTs ? formatLastSync(lastSyncTs) : "Nunca"}
                  </span>
                </span>
              </div>
            </>
          )}
        </div>
      )}
    </SubSection>
  );
}
