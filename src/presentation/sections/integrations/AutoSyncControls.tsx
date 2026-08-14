import { useAppConfig } from "@presentation/contexts/ConfigContext";
import { useAutoSync } from "@presentation/contexts/AutoSyncContext";
import type { AppConfig } from "@shared/types/appConfig";
import { formatLastSync, todayISO } from "@shared/utils/time";
import { showToast } from "@shared/utils/toast";
import { RefreshCw } from "lucide-react";
import { useEffect, useState } from "react";
import { Button, Input, SegmentedControl, Toggle } from "@presentation/components/ui";
import { Row, SubSection } from "./shared";

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

/**
 * Habilita o "Sincronizar agora" da integração. Opcional porque nem toda
 * integração registra uma estratégia no `AutoSyncRunner` — sem ela o botão
 * dispararia no vazio.
 */
export interface AutoSyncNow {
  /** Nome no runner; é por ele que o botão dispara **só** esta integração. */
  integrationName: string;
  /** O que o `count` conta muda por destino (tarefas no Sheets, atividades no
   *  Monday), então a frase de sucesso vem de quem chama. */
  successMessage: (count: number) => string;
}

const MODES = [
  { value: "per-task", label: "Por tarefa" },
  { value: "daily", label: "Diário" },
] as const;
const TRIGGERS = [
  { value: "on-open", label: "Ao abrir o app" },
  { value: "fixed-time", label: "Horário fixo" },
] as const;

export function AutoSyncControls({
  keys,
  syncNow,
}: {
  keys: AutoSyncConfigKeys;
  syncNow?: AutoSyncNow;
}) {
  const config = useAppConfig();
  const { runDailyFor, isSyncing } = useAutoSync();
  const [autoSync, setAutoSync] = useState(false);
  const [syncMode, setSyncMode] = useState<"per-task" | "daily">("per-task");
  const [syncTrigger, setSyncTrigger] = useState<"on-open" | "fixed-time">("on-open");
  const [syncTime, setSyncTime] = useState("18:00");
  const [lastSyncTs, setLastSyncTs] = useState("");
  const [syncing, setSyncing] = useState(false);
  const autoSyncing = syncNow ? isSyncing(syncNow.integrationName) : false;

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

  async function handleSyncNow() {
    if (!syncNow) return;
    setSyncing(true);
    try {
      const result = await runDailyFor(syncNow.integrationName, todayISO());
      // Só acontece se a integração não estiver registrada no runner — o botão
      // não teria o que disparar, e um toast de sucesso mentiria.
      if (!result) {
        await showToast("error", `Integração ${syncNow.integrationName} indisponível.`);
        return;
      }
      if (result.error) {
        await showToast("error", result.error.message);
        return;
      }
      // A estratégia grava o timestamp; reler a config mantém o "Último envio"
      // em dia sem esperar uma remontagem da tela.
      setLastSyncTs(config.get(keys.lastSync));
      if (result.count === 0) {
        if (result.warning) await showToast("warning", result.warning, 6000);
        else await showToast("success", "Tudo sincronizado — nenhuma tarefa nova encontrada.");
        return;
      }
      const success = syncNow.successMessage(result.count);
      if (result.warning) await showToast("warning", `${success} ${result.warning}`, 6000);
      else await showToast("success", success);
    } finally {
      setSyncing(false);
    }
  }

  return (
    <SubSection
      icon={<RefreshCw size={14} />}
      title="Sincronização automática"
      badge={
        autoSync ? (
          <span className="ml-1 text-xs text-accent-text font-medium">Ativa</span>
        ) : undefined
      }
    >
      <Row label="Ativar">
        <Toggle
          ariaLabel="Ativar sincronização automática"
          checked={autoSync}
          onChange={async (v) => {
            setAutoSync(v);
            await config.set(keys.enabled, v);
          }}
        />
      </Row>

      {autoSync && (
        <div className="pl-4 border-l border-border-subtle ml-1 mb-1">
          <div className="py-2.5 border-b border-border-subtle">
            <div className="flex items-center justify-between">
              <span className="text-sm text-fg-secondary">Modo</span>
              <SegmentedControl
                value={syncMode}
                options={MODES}
                ariaLabel="Modo de sincronização"
                onChange={async (m) => {
                  setSyncMode(m);
                  await config.set(keys.mode, m);
                }}
              />
            </div>
            <p className="text-xs text-fg-muted mt-1.5">
              {syncMode === "per-task"
                ? "Envia cada tarefa automaticamente ao ser concluída."
                : "Agrupa e envia de uma vez, cobrindo fins de semana e dias perdidos."}
            </p>
          </div>

          {syncMode === "daily" && (
            <>
              <div className="py-2.5 border-b border-border-subtle">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-fg-secondary">Gatilho</span>
                  <SegmentedControl
                    value={syncTrigger}
                    options={TRIGGERS}
                    ariaLabel="Gatilho da sincronização"
                    onChange={async (t) => {
                      setSyncTrigger(t);
                      await config.set(keys.trigger, t);
                    }}
                  />
                </div>
              </div>

              {syncTrigger === "fixed-time" && (
                <Row label="Horário">
                  <Input
                    type="time"
                    size="sm"
                    value={syncTime}
                    onChange={(e) => setSyncTime(e.target.value)}
                    onBlur={() => config.set(keys.time, syncTime)}
                    className="w-auto!"
                  />
                </Row>
              )}

              <div className="py-2.5 flex items-center justify-between gap-3">
                <span className="text-xs text-fg-muted shrink-0">
                  Último envio:{" "}
                  <span className="text-fg-secondary">
                    {lastSyncTs ? formatLastSync(lastSyncTs) : "Nunca"}
                  </span>
                </span>
                {syncNow && (
                  <Button
                    onClick={handleSyncNow}
                    loading={syncing || autoSyncing}
                    title={autoSyncing ? "Sincronização automática em andamento…" : undefined}
                    icon={<RefreshCw size={14} />}
                    className="shrink-0"
                  >
                    {autoSyncing
                      ? "Sincronização automática…"
                      : syncing
                        ? "Sincronizando…"
                        : "Sincronizar agora"}
                  </Button>
                )}
              </div>
            </>
          )}
        </div>
      )}
    </SubSection>
  );
}
