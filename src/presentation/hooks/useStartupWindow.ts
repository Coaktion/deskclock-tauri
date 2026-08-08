import { useCallback, useEffect, type RefObject } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { PhysicalPosition } from "@tauri-apps/api/dpi";
import { WebviewWindow } from "@tauri-apps/api/webviewWindow";
import { positionNearTaskbar, centerOnWorkArea } from "@shared/utils/windowPosition";
import type { ConfigContextValue } from "@shared/types/appConfig";

const appWindow = getCurrentWindow();

/** Precisa acompanhar `main` em `tauri.conf.json`: é a partir dela que o
 *  posicionamento calcula o canto, e divergir joga a janela fora da área útil. */
const MAIN_WINDOW_SIZE = { width: 1000, height: 700 };

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
        await positionNearTaskbar(appWindow, MAIN_WINDOW_SIZE);
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
      positionNearTaskbar(appWindow, MAIN_WINDOW_SIZE)
        .catch(() => {})
        .finally(() => appWindow.show());
      return;
    }
    // Overlay compact é always-on-top e deve aparecer mesmo antes de o setup ser
    // concluído. Apenas exibe — o próprio overlay já se reposiciona na própria
    // posição salva ao montar (ver useOverlayDrag.restore), validando contra os
    // monitores conectados. Reposicionar por aqui também criaria uma segunda
    // gravação concorrente e faria o listener de drag do overlay persistir essa
    // reposição como se fosse um arraste do usuário, sobrescrevendo a posição real.
    if (config.get("overlayAlwaysVisible")) {
      void (async () => {
        const compact = await getOverlayCompact();
        if (!compact) return;
        await compact.show().catch(() => {});
      })();
    }

    if (!config.get("setupCompleted")) {
      positionNearTaskbar(appWindow, MAIN_WINDOW_SIZE)
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
