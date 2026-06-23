import { useCallback, useEffect, type RefObject } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { PhysicalPosition } from "@tauri-apps/api/dpi";
import { WebviewWindow } from "@tauri-apps/api/webviewWindow";
import {
  positionNearTaskbar,
  centerOnWorkArea,
  isPointOnScreen,
} from "@shared/utils/windowPosition";
import type { ConfigContextValue } from "@shared/types/appConfig";

const appWindow = getCurrentWindow();

async function getOverlayCompact() {
  return WebviewWindow.getByLabel("overlay-compact");
}

async function getCommandPalette() {
  return WebviewWindow.getByLabel("command-palette");
}

export function useStartupWindow(
  config: ConfigContextValue,
  ignoreBlurRef: RefObject<boolean>,
  isPinnedRef: RefObject<boolean>
) {
  const showMainWindow = useCallback(
    async (focusToo = false) => {
      const saved = config.get("mainWindowPosition");
      if (saved.x >= 0 && saved.y >= 0) {
        await appWindow.setPosition(new PhysicalPosition(saved.x, saved.y));
      } else {
        await positionNearTaskbar(appWindow, { width: 800, height: 620 });
      }
      await appWindow.show();
      if (focusToo) await appWindow.setFocus();
    },
    [config]
  );

  const showCommandPalette = useCallback(async () => {
    const cp = await getCommandPalette();
    if (!cp) return;
    await centerOnWorkArea(cp, { width: 560, height: 500 });
    await cp.show();
    await cp.setFocus();
  }, []);

  // Fecha janela ao perder foco, se habilitado e não fixada
  useEffect(() => {
    const unlisten = appWindow.listen("tauri://blur", () => {
      if (ignoreBlurRef.current) return;
      if (isPinnedRef.current) return;
      if (!config.get("closeOnFocusLoss")) return;
      appWindow.hide();
    });

    // Cliques ou teclas dentro da webview podem causar blur falso (foco DOM cai
    // no body após re-render ou submit de formulário via Enter). Suprimir o blur
    // por 300 ms após qualquer interação interna.
    function suppressBlur() {
      ignoreBlurRef.current = true;
      setTimeout(() => {
        ignoreBlurRef.current = false;
      }, 300);
    }
    document.addEventListener("pointerdown", suppressBlur);
    document.addEventListener("keydown", suppressBlur);

    return () => {
      unlisten.then((fn) => fn());
      document.removeEventListener("pointerdown", suppressBlur);
      document.removeEventListener("keydown", suppressBlur);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Salva posição da janela principal ao ser movida pelo usuário
  useEffect(() => {
    if (!config.isLoaded) return;
    let debounce: ReturnType<typeof setTimeout> | null = null;
    const unlisten = appWindow.listen<{ x: number; y: number }>("tauri://move", ({ payload }) => {
      if (debounce) clearTimeout(debounce);
      debounce = setTimeout(() => {
        config.set("mainWindowPosition", { x: payload.x, y: payload.y });
      }, 400);
    });
    return () => {
      unlisten.then((fn) => fn());
      if (debounce) clearTimeout(debounce);
    };
  }, [config.isLoaded]); // eslint-disable-line react-hooks/exhaustive-deps

  // Posiciona e exibe as janelas ao iniciar
  useEffect(() => {
    if (!config.isLoaded) return;
    if (config.loadError) {
      positionNearTaskbar(appWindow, { width: 800, height: 620 })
        .catch(() => {})
        .finally(() => appWindow.show());
      return;
    }
    // Overlay compact é always-on-top e deve aparecer mesmo antes de o setup ser
    // concluído. O show() roda sempre (mesmo se o posicionamento falhar) e a
    // posição salva é validada contra os monitores conectados — assim o overlay
    // nunca fica fora da tela quando um monitor externo é desconectado.
    if (config.get("overlayAlwaysVisible")) {
      void (async () => {
        const compact = await getOverlayCompact();
        if (!compact) return;
        try {
          const savedPos = config.get("overlayPosition_compact") as { x: number; y: number } | null;
          const hasSaved = savedPos !== null && !(savedPos.x === -1 && savedPos.y === -1);
          if (hasSaved && (await isPointOnScreen(savedPos!.x, savedPos!.y))) {
            await compact.setPosition(new PhysicalPosition(savedPos!.x, savedPos!.y));
          } else {
            await positionNearTaskbar(compact, { width: 52, height: 52 });
          }
        } catch {
          // Posicionamento é best-effort — nunca deve impedir a exibição.
        } finally {
          await compact.show().catch(() => {});
        }
      })();
    }

    if (!config.get("setupCompleted")) {
      positionNearTaskbar(appWindow, { width: 800, height: 620 })
        .catch(() => {})
        .finally(() => appWindow.show());
      return;
    }

    if (config.get("showWelcomeMessage")) {
      void (async () => {
        const cp = await getCommandPalette();
        if (cp) {
          await showCommandPalette();
        } else {
          await showMainWindow();
        }
      })();
    } else {
      void showMainWindow();
    }
  }, [config.isLoaded]); // eslint-disable-line react-hooks/exhaustive-deps

  return { showMainWindow, showCommandPalette };
}
