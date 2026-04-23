import { useEffect, useRef } from "react";
import { currentMonitor, monitorFromPoint, primaryMonitor, getCurrentWindow } from "@tauri-apps/api/window";
import { PhysicalPosition } from "@tauri-apps/api/dpi";
import { snapPositionToGrid } from "@shared/utils/snapToGrid";
import { positionNearTaskbar } from "@shared/utils/windowPosition";
import type { ConfigContextValue } from "@presentation/contexts/ConfigContext";

type PositionKey = "overlayPosition_compact" | "overlayPosition_execution" | "overlayPosition_planning";

const appWindow = getCurrentWindow();

/** Restores the saved overlay position or falls back to positionNearTaskbar. */
export async function restoreOverlayPosition(
  configKey: PositionKey,
  config: ConfigContextValue,
  fallbackSize: { width: number; height: number },
) {
  const saved = config.get(configKey) as { x: number; y: number };
  if (saved?.x >= 0 && saved?.y >= 0) {
    const pos = new PhysicalPosition(saved.x, saved.y);
    await appWindow.setPosition(pos).catch(() => {});
    setTimeout(() => appWindow.setPosition(pos).catch(() => {}), 150);
  } else {
    void positionNearTaskbar(appWindow, fallbackSize);
  }
}

/** Handles drag-to-move with snap-to-grid and position persistence. */
export function useOverlayDrag(
  configKey: PositionKey,
  snapToGrid: boolean,
  config: ConfigContextValue,
  onPositionChange?: () => void,
) {
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastRawPosRef = useRef({ x: 0, y: 0 });
  const isProgrammaticMoveRef = useRef(false);

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
        const hw = Math.round(winSize.width / 2);
        const hh = Math.round(winSize.height / 2);
        const monitor =
          await monitorFromPoint(rawX + hw, rawY + hh).catch(() => null) ??
          await currentMonitor().catch(() => null) ??
          await primaryMonitor().catch(() => null);
        if (monitor) {
          const { position: ori, size: scr } = monitor;
          snapped = {
            x: Math.max(ori.x, Math.min(snapped.x, ori.x + scr.width  - winSize.width)),
            y: Math.max(ori.y, Math.min(snapped.y, ori.y + scr.height - winSize.height)),
          };
        }

        if (snapped.x !== rawX || snapped.y !== rawY) {
          isProgrammaticMoveRef.current = true;
          await appWindow.setPosition(new PhysicalPosition(snapped.x, snapped.y));
          setTimeout(() => { isProgrammaticMoveRef.current = false; }, 100);
        }
        await config.set(configKey, snapped as never);
        onPositionChange?.();
      }, 200);
    });
    return () => {
      unlisten.then((fn) => fn());
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [config, configKey, snapToGrid, onPositionChange]);
}
