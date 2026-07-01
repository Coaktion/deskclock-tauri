import type { ConfigContextValue } from "@presentation/contexts/ConfigContext";
import { snapPositionToGrid } from "@shared/utils/snapToGrid";
import { isPointOnScreen, positionNearTaskbar } from "@shared/utils/windowPosition";
import { PhysicalPosition } from "@tauri-apps/api/dpi";
import {
  currentMonitor,
  getCurrentWindow,
  monitorFromPoint,
  primaryMonitor,
} from "@tauri-apps/api/window";
import { useCallback, useEffect, useRef } from "react";

type PositionKey =
  | "overlayPosition_compact"
  | "overlayPosition_execution"
  | "overlayPosition_planning";

const appWindow = getCurrentWindow();

/** Restores the saved overlay position, validated against connected monitors, or falls back to positionNearTaskbar. */
async function restorePosition(
  configKey: PositionKey,
  config: ConfigContextValue,
  fallbackSize: { width: number; height: number }
) {
  const saved = config.get(configKey) as { x: number; y: number };
  // Check for explicit save (default sentinel is {x:-1, y:-1}); allow negative coords for
  // multi-monitor setups or DPI-offset windows positioned near the left/top edge.
  const hasSaved = saved && !(saved.x === -1 && saved.y === -1);
  if (hasSaved && (await isPointOnScreen(saved.x, saved.y).catch(() => false))) {
    const pos = new PhysicalPosition(saved.x, saved.y);
    await appWindow.setPosition(pos).catch(() => {});
    setTimeout(() => appWindow.setPosition(pos).catch(() => {}), 150);
  } else {
    void positionNearTaskbar(appWindow, fallbackSize);
  }
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
