import { useEffect, useState } from "react";
import { useAppConfig } from "@presentation/contexts/ConfigContext";
import {
  WAYLAND_SHORTCUTS_WARNING,
  failedShortcutsWarning,
} from "@domain/usecases/settings/shortcuts";
import { saveShortcuts, tauriSettingsSystem } from "@presentation/settings/settingsEffects";
import { AlertTriangle } from "lucide-react";
import { ShortcutRow } from "./ShortcutRow";
import { SectionCard, SectionRow } from "@presentation/components/ui";

/** Mesma caixa do aviso de erro da API, no token de aviso. */
function WarningBanner({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2 rounded-control bg-warning/10 border border-warning/30 px-3 py-2.5">
      <AlertTriangle size={14} className="text-warning mt-0.5 shrink-0" />
      <p className="text-xs text-warning">{children}</p>
    </div>
  );
}

export function AtalhosTab() {
  const config = useAppConfig();

  const [shortcutToggleTask, setShortcutToggleTask] = useState("");
  const [shortcutStopTask, setShortcutStopTask] = useState("");
  const [shortcutToggleOverlay, setShortcutToggleOverlay] = useState("");
  const [shortcutToggleWindow, setShortcutToggleWindow] = useState("");
  const [displayServer, setDisplayServer] = useState("");
  const [failedShortcuts, setFailedShortcuts] = useState<string[]>([]);

  useEffect(() => {
    if (!config.isLoaded) return;
    setShortcutToggleTask(config.get("shortcutToggleTask"));
    setShortcutStopTask(config.get("shortcutStopTask"));
    setShortcutToggleOverlay(config.get("shortcutToggleOverlay"));
    setShortcutToggleWindow(config.get("shortcutToggleWindow"));
  }, [config.isLoaded]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    tauriSettingsSystem
      .displayServer()
      .then(setDisplayServer)
      .catch(() => {});
  }, []);

  async function applyShortcuts(
    overrides?: Partial<{
      toggleTask: string;
      stopTask: string;
      toggleOverlay: string;
      toggleWindow: string;
    }>
  ) {
    const t = overrides?.toggleTask ?? shortcutToggleTask;
    const s = overrides?.stopTask ?? shortcutStopTask;
    const o = overrides?.toggleOverlay ?? shortcutToggleOverlay;
    const w = overrides?.toggleWindow ?? shortcutToggleWindow;
    const failed = await saveShortcuts(config, tauriSettingsSystem, {
      toggleTask: t,
      stopTask: s,
      toggleOverlay: o,
      toggleWindow: w,
    });
    setFailedShortcuts(failed);
  }

  return (
    <div className="space-y-5">
      {displayServer === "wayland" && <WarningBanner>{WAYLAND_SHORTCUTS_WARNING}</WarningBanner>}
      {failedShortcuts.length > 0 && displayServer !== "wayland" && (
        <WarningBanner>{failedShortcutsWarning(failedShortcuts.length)}</WarningBanner>
      )}

      <SectionCard title="Tarefa e janelas" divided>
        <SectionRow>
          <ShortcutRow
            label="Iniciar / Pausar / Retomar"
            description="Alterna execução da tarefa atual"
            value={shortcutToggleTask}
            failed={failedShortcuts.includes(shortcutToggleTask) && !!shortcutToggleTask}
            onSave={(v) => {
              setShortcutToggleTask(v);
              applyShortcuts({ toggleTask: v });
            }}
          />
        </SectionRow>
        <SectionRow>
          <ShortcutRow
            label="Parar"
            description="Para a tarefa em execução"
            value={shortcutStopTask}
            failed={failedShortcuts.includes(shortcutStopTask) && !!shortcutStopTask}
            onSave={(v) => {
              setShortcutStopTask(v);
              applyShortcuts({ stopTask: v });
            }}
          />
        </SectionRow>
        <SectionRow>
          <ShortcutRow
            label="Mostrar / Ocultar overlay"
            description="Alterna visibilidade do overlay"
            value={shortcutToggleOverlay}
            failed={failedShortcuts.includes(shortcutToggleOverlay) && !!shortcutToggleOverlay}
            onSave={(v) => {
              setShortcutToggleOverlay(v);
              applyShortcuts({ toggleOverlay: v });
            }}
          />
        </SectionRow>
        <SectionRow>
          <ShortcutRow
            label="Mostrar / Ocultar janela"
            description="Alterna visibilidade da janela principal"
            value={shortcutToggleWindow}
            failed={failedShortcuts.includes(shortcutToggleWindow) && !!shortcutToggleWindow}
            onSave={(v) => {
              setShortcutToggleWindow(v);
              applyShortcuts({ toggleWindow: v });
            }}
          />
        </SectionRow>
      </SectionCard>
    </div>
  );
}
