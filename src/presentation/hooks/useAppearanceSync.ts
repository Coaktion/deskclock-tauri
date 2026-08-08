import { useEffect } from "react";
import { listen } from "@tauri-apps/api/event";
import type { ConfigContextValue } from "@shared/types/appConfig";
import { applyFontSize } from "@shared/utils/fontSize";
import { applyAppearance, readAppliedAppearance, resolveAppearance } from "@shared/utils/theme";
import { OVERLAY_EVENTS, type OverlayConfigChangedPayload } from "@shared/types/overlayEvents";

/**
 * Aparência de uma janela: aplica o que está gravado e acompanha a troca feita em
 * qualquer outra. Cada eixo chega no seu próprio evento, e o que não chegou vem
 * do próprio documento — a config desta janela é um retrato do mount e não sabe
 * do que a janela principal acabou de gravar.
 */
export function useAppearanceSync(config: ConfigContextValue) {
  useEffect(() => {
    if (!config.isLoaded) return;
    applyFontSize(config.get("fontSize"));
    applyAppearance(
      resolveAppearance({
        mode: config.get("mode"),
        accent: config.get("accent"),
        theme: config.get("theme"),
      })
    );
  }, [config.isLoaded]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const unlisten = listen<OverlayConfigChangedPayload>(
      OVERLAY_EVENTS.OVERLAY_CONFIG_CHANGED,
      ({ payload }) => {
        if (payload.key === "fontSize") applyFontSize(payload.value as string);
        else if (payload.key === "mode" || payload.key === "accent") {
          applyAppearance(
            resolveAppearance({ ...readAppliedAppearance(), [payload.key]: payload.value })
          );
        }
      }
    );
    return () => {
      unlisten.then((fn) => fn());
    };
  }, []);
}
