import { useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { ConfigContextValue } from "@shared/types/appConfig";
import { getCurrentWindow } from "@tauri-apps/api/window";

const appWindow = getCurrentWindow();

export function useGlobalShortcuts(config: ConfigContextValue) {
  // Registra atalhos globais do Tauri ao iniciar
  useEffect(() => {
    if (!config.isLoaded) return;
    invoke("update_shortcuts", {
      shortcuts: [
        { action: "toggle-task", accelerator: config.get("shortcutToggleTask") },
        { action: "stop-task", accelerator: config.get("shortcutStopTask") },
        { action: "toggle-overlay", accelerator: config.get("shortcutToggleOverlay") },
        { action: "toggle-window", accelerator: config.get("shortcutToggleWindow") },
        { action: "toggle-command-palette", accelerator: config.get("shortcutCommandPalette") },
      ],
    }).catch(() => {});
  }, [config.isLoaded]); // eslint-disable-line react-hooks/exhaustive-deps

  // ESC fecha a janela (exceto quando um input/textarea/select está focado)
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key !== "Escape") return;
      const tag = (document.activeElement as HTMLElement)?.tagName ?? "";
      if (["INPUT", "TEXTAREA", "SELECT"].includes(tag)) return;
      if (document.querySelector("[data-modal-open]")) return;
      appWindow.hide();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);
}
