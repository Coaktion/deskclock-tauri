import type { ConfigContextValue } from "@presentation/contexts/ConfigContext";
import { snapPositionToGrid } from "@shared/utils/snapToGrid";
import { clampIntoMonitor, positionNearTaskbar } from "@shared/utils/windowPosition";
import { PhysicalPosition } from "@tauri-apps/api/dpi";
import {
  currentMonitor,
  getCurrentWindow,
  monitorFromPoint,
  primaryMonitor,
} from "@tauri-apps/api/window";
import { useCallback, useEffect, useRef } from "react";

type PositionKey =
  "overlayPosition_compact" | "overlayPosition_execution" | "overlayPosition_planning";

const appWindow = getCurrentWindow();

/**
 * Resolve para onde a janela deve ir dada a posição salva: mantém a posição se o
 * CENTRO da janela cai em algum monitor; se cair fora de todos (ex.: monitor
 * externo desconectado), encaixa na tela mais próxima em vez de resetar.
 *
 * Usar o centro — e não o canto superior-esquerdo — é essencial: uma janela sem
 * moldura encostada na borda esquerda/inferior reporta o canto com coordenada
 * levemente negativa (moldura invisível), o que fazia a checagem antiga rejeitar
 * uma posição válida e cair no fallback do canto oposto.
 */
async function resolveVisiblePosition(
  saved: { x: number; y: number },
  fallbackSize: { width: number; height: number }
): Promise<{ x: number; y: number }> {
  const outer = await appWindow.outerSize().catch(() => null);
  const w = outer && outer.width > 0 ? outer.width : fallbackSize.width;
  const h = outer && outer.height > 0 ? outer.height : fallbackSize.height;

  const cx = saved.x + Math.round(w / 2);
  const cy = saved.y + Math.round(h / 2);
  const onScreen = await monitorFromPoint(cx, cy).catch(() => null);
  if (onScreen) return saved;

  const mon =
    (await currentMonitor().catch(() => null)) ?? (await primaryMonitor().catch(() => null));
  if (!mon) return saved;
  return clampIntoMonitor(
    {
      position: { x: mon.position.x, y: mon.position.y },
      size: { width: mon.size.width, height: mon.size.height },
    },
    saved,
    { width: w, height: h }
  );
}

/** Restores the saved overlay position (clamping into the nearest monitor if off-screen),
 * or falls back to positionNearTaskbar when there is no saved position yet. */
async function restorePosition(
  configKey: PositionKey,
  config: ConfigContextValue,
  fallbackSize: { width: number; height: number }
) {
  const saved = config.get(configKey) as { x: number; y: number };
  // Sentinela padrão {x:-1, y:-1} = nunca posicionado → canto padrão perto da bandeja.
  const hasSaved = saved && !(saved.x === -1 && saved.y === -1);
  if (!hasSaved) {
    void positionNearTaskbar(appWindow, fallbackSize);
    return;
  }
  const target = await resolveVisiblePosition(saved, fallbackSize);
  const pos = new PhysicalPosition(target.x, target.y);
  await appWindow.setPosition(pos).catch(() => {});
  setTimeout(() => appWindow.setPosition(pos).catch(() => {}), 150);
}

/** Handles drag-to-move with snap-to-grid and position persistence. Returns a
 * restore function the caller must invoke once on mount to apply the saved position. */
export function useOverlayDrag(
  configKey: PositionKey,
  snapToGrid: boolean,
  config: ConfigContextValue,
  onPositionChange?: () => void,
  overlaySize?: { width: number; height: number }
) {
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastRawPosRef = useRef({ x: 0, y: 0 });
  const isProgrammaticMoveRef = useRef(false);

  // Restore is programmatic, not a user drag — guard the move listener below so it
  // doesn't persist the restored (or off-screen fallback) position back into config,
  // which would permanently overwrite the user's real saved position.
  const restore = useCallback(
    async (fallbackSize: { width: number; height: number }) => {
      isProgrammaticMoveRef.current = true;
      try {
        await restorePosition(configKey, config, fallbackSize);
      } finally {
        setTimeout(() => {
          isProgrammaticMoveRef.current = false;
        }, 500);
      }
    },
    [config, configKey]
  );

  useEffect(() => {
    const unlisten = appWindow.listen<{ x: number; y: number }>("tauri://move", ({ payload }) => {
      if (isProgrammaticMoveRef.current) return;
      lastRawPosRef.current = { x: payload.x, y: payload.y };
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(async () => {
        const { x: rawX, y: rawY } = lastRawPosRef.current;
        let snapped = snapToGrid ? snapPositionToGrid(rawX, rawY) : { x: rawX, y: rawY };

        // Clamp to monitor bounds — snap can push window past screen edge
        const winSize = await appWindow.outerSize();
        const contentSize = overlaySize ?? winSize;
        // When content is smaller than the window (e.g. 78×52 inside a 200×200 GTK window),
        // compute the centering offset so clamping anchors on the visible area, not the window frame.
        const offsetX = Math.round((winSize.width - contentSize.width) / 2);
        const offsetY = Math.round((winSize.height - contentSize.height) / 2);
        const hw = Math.round(winSize.width / 2);
        const hh = Math.round(winSize.height / 2);
        const monitor =
          (await monitorFromPoint(rawX + hw, rawY + hh).catch(() => null)) ??
          (await currentMonitor().catch(() => null)) ??
          (await primaryMonitor().catch(() => null));
        if (monitor) {
          const { position: ori, size: scr } = monitor;
          snapped = {
            x: Math.max(
              ori.x - offsetX,
              Math.min(snapped.x, ori.x + scr.width - offsetX - contentSize.width)
            ),
            y: Math.max(
              ori.y - offsetY,
              Math.min(snapped.y, ori.y + scr.height - offsetY - contentSize.height)
            ),
          };
        }

        if (snapped.x !== rawX || snapped.y !== rawY) {
          isProgrammaticMoveRef.current = true;
          await appWindow.setPosition(new PhysicalPosition(snapped.x, snapped.y));
          setTimeout(() => {
            isProgrammaticMoveRef.current = false;
          }, 100);
        }
        await config.set(configKey, snapped as never);
        onPositionChange?.();
      }, 200);
    });
    return () => {
      unlisten.then((fn) => fn());
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [config, configKey, snapToGrid, onPositionChange, overlaySize]);

  return restore;
}
