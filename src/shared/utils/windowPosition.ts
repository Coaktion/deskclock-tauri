import { currentMonitor, primaryMonitor } from "@tauri-apps/api/window";
import type { Window } from "@tauri-apps/api/window";
import type { WebviewWindow } from "@tauri-apps/api/webviewWindow";
import { PhysicalPosition } from "@tauri-apps/api/dpi";

export async function centerOnWorkArea(
  win: Window | WebviewWindow,
  fallback?: { width: number; height: number },
): Promise<void> {
  const [monitorResult, outerSize] = await Promise.all([
    currentMonitor().then((m) => m ?? primaryMonitor()),
    win.outerSize(),
  ]);
  if (!monitorResult) return;

  const { scaleFactor, workArea } = monitorResult;
  const winW = outerSize.width > 0 ? outerSize.width : Math.round((fallback?.width ?? 560) * scaleFactor);
  const winH = outerSize.height > 0 ? outerSize.height : Math.round((fallback?.height ?? 500) * scaleFactor);

  const x = workArea.position.x + Math.round((workArea.size.width - winW) / 2);
  const y = workArea.position.y + Math.round((workArea.size.height - winH) / 2);
  await win.setPosition(new PhysicalPosition(x, y));
  setTimeout(() => win.setPosition(new PhysicalPosition(x, y)).catch(() => {}), 150);
}

export async function positionNearTaskbar(
  win: Window | WebviewWindow,
  fallback?: { width: number; height: number },
): Promise<void> {
  const [monitorResult, outerSize] = await Promise.all([
    currentMonitor().then((m) => m ?? primaryMonitor()),
    win.outerSize(),
  ]);
  if (!monitorResult) return;

  const { scaleFactor, workArea } = monitorResult;
  const winW = outerSize.width > 0 ? outerSize.width : Math.round((fallback?.width ?? 800) * scaleFactor);
  const winH = outerSize.height > 0 ? outerSize.height : Math.round((fallback?.height ?? 620) * scaleFactor);

  const x = workArea.position.x + Math.max(0, workArea.size.width - winW);
  const y = workArea.position.y + Math.max(0, workArea.size.height - winH);
  await win.setPosition(new PhysicalPosition(x, y));
  setTimeout(() => win.setPosition(new PhysicalPosition(x, y)).catch(() => {}), 150);
}
