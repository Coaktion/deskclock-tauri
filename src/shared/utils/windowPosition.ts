import { currentMonitor, monitorFromPoint, primaryMonitor } from "@tauri-apps/api/window";
import type { Window } from "@tauri-apps/api/window";
import { WebviewWindow } from "@tauri-apps/api/webviewWindow";
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

/** Positions the overlay popup adjacent to the compact overlay, screen-quadrant-aware. */
export async function positionPopupNearCompact(
  popup: Window | WebviewWindow,
  logicalSize: { width: number; height: number },
): Promise<void> {
  const compact = await WebviewWindow.getByLabel("overlay-compact");
  if (!compact) return;

  const [compactPos, compactSize] = await Promise.all([
    compact.outerPosition(),
    compact.outerSize(),
  ]);

  // Find the monitor containing the compact window's center point
  const cx = compactPos.x + Math.round(compactSize.width / 2);
  const cy = compactPos.y + Math.round(compactSize.height / 2);
  const monitorResult = await monitorFromPoint(cx, cy).catch(() => null) ?? await primaryMonitor();
  if (!monitorResult) return;

  const { scaleFactor, size: screenSize, position: screenOrigin } = monitorResult;
  const popupPhysW = Math.round(logicalSize.width * scaleFactor);
  const popupPhysH = Math.round(logicalSize.height * scaleFactor);
  const gapPhys = Math.round(8 * scaleFactor);

  // Prefer right of compact; fall back to left if it would overflow
  let x: number;
  if (compactPos.x + compactSize.width + gapPhys + popupPhysW <= screenOrigin.x + screenSize.width) {
    x = compactPos.x + compactSize.width + gapPhys;
  } else {
    x = compactPos.x - gapPhys - popupPhysW;
  }

  // Top-aligned with compact
  let y = compactPos.y;

  // Clamp to screen bounds
  x = Math.max(screenOrigin.x, Math.min(x, screenOrigin.x + screenSize.width - popupPhysW));
  y = Math.max(screenOrigin.y, Math.min(y, screenOrigin.y + screenSize.height - popupPhysH));

  const pos = new PhysicalPosition(Math.round(x), Math.round(y));
  await popup.setPosition(pos);
  setTimeout(() => popup.setPosition(pos).catch(() => {}), 150);
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
