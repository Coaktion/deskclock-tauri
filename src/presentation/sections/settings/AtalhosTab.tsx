import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useAppConfig } from "@presentation/contexts/ConfigContext";
import { AlertTriangle } from "lucide-react";
import { ShortcutRow } from "./ShortcutRow";
import { SectionCard, SectionRow } from "@presentation/components/ui";

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
    invoke<string>("get_display_server")
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
    const failed = await invoke<string[]>("update_shortcuts", {
      shortcuts: [
        { action: "toggle-task", accelerator: t },
        { action: "stop-task", accelerator: s },
        { action: "toggle-overlay", accelerator: o },
        { action: "toggle-window", accelerator: w },
      ],
    });
    setFailedShortcuts(failed);
    await config.set("shortcutToggleTask", t);
    await config.set("shortcutStopTask", s);
    await config.set("shortcutToggleOverlay", o);
    await config.set("shortcutToggleWindow", w);
  }

  return (
    <div className="space-y-3">
      {displayServer === "wayland" && (
        <div className="flex items-start gap-2 rounded-control bg-amber-950/40 border border-amber-800/50 px-3 py-2.5">
          <AlertTriangle size={14} className="text-amber-400 mt-0.5 shrink-0" />
          <p className="text-xs text-amber-300">
            Atalhos globais usam XGrabKey e não funcionam no Wayland. Execute o app em XWayland ou
            mude para uma sessão X11 para usar este recurso.
          </p>
        </div>
      )}
      {failedShortcuts.length > 0 && displayServer !== "wayland" && (
        <div className="flex items-start gap-2 rounded-control bg-amber-950/40 border border-amber-800/50 px-3 py-2.5">
          <AlertTriangle size={14} className="text-amber-400 mt-0.5 shrink-0" />
          <p className="text-xs text-amber-300">
            {failedShortcuts.length === 1
              ? "Um atalho não pôde ser registrado — pode estar em uso por outro aplicativo."
              : `${failedShortcuts.length} atalhos não puderam ser registrados — podem estar em uso por outro aplicativo.`}
          </p>
        </div>
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
