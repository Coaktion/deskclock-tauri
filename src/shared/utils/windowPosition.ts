import { currentMonitor, primaryMonitor } from "@tauri-apps/api/window";
import type { Window } from "@tauri-apps/api/window";
import type { WebviewWindow } from "@tauri-apps/api/webviewWindow";
import { PhysicalPosition } from "@tauri-apps/api/dpi";
import { ConfigRepository } from "@infra/database/ConfigRepository";

export interface WindowPositionOverride {
  auto: boolean;
  workAreaWidth: number;
  workAreaHeight: number;
  taskbarPosition: "top" | "bottom" | "left" | "right";
  taskbarSize: number;
}

// Repo criado sob demanda — não no nível do módulo — para não abrir conexão SQLite
// em todos os webviews ao importar este arquivo.
export async function readPositionConfig(): Promise<WindowPositionOverride> {
  try {
    const repo = new ConfigRepository();
    const [auto, w, h, pos, size] = await Promise.all([
      repo.get<boolean>("windowPositioningAuto", true),
      repo.get<number>("workAreaWidth", 0),
      repo.get<number>("workAreaHeight", 0),
      repo.get<"top" | "bottom" | "left" | "right">("taskbarPosition", "bottom"),
      repo.get<number>("taskbarSize", 40),
    ]);
    return { auto, workAreaWidth: w, workAreaHeight: h, taskbarPosition: pos, taskbarSize: size };
  } catch {
    return { auto: true, workAreaWidth: 0, workAreaHeight: 0, taskbarPosition: "bottom", taskbarSize: 40 };
  }
}

function computeArea(
  cfg: WindowPositionOverride,
  monitor: Awaited<ReturnType<typeof primaryMonitor>> & object,
): { areaX: number; areaY: number; areaW: number; areaH: number } {
  const { scaleFactor } = monitor;
  if (!cfg.auto && cfg.workAreaWidth > 0 && cfg.workAreaHeight > 0) {
    const taskbarPx = Math.round(cfg.taskbarSize * scaleFactor);
    const totalW = Math.round(cfg.workAreaWidth * scaleFactor);
    const totalH = Math.round(cfg.workAreaHeight * scaleFactor);
    const monPos = monitor.position;
    switch (cfg.taskbarPosition) {
      case "top":   return { areaX: monPos.x, areaY: monPos.y + taskbarPx, areaW: totalW, areaH: totalH - taskbarPx };
      case "left":  return { areaX: monPos.x + taskbarPx, areaY: monPos.y, areaW: totalW - taskbarPx, areaH: totalH };
      case "right": return { areaX: monPos.x, areaY: monPos.y, areaW: totalW - taskbarPx, areaH: totalH };
      default:      return { areaX: monPos.x, areaY: monPos.y, areaW: totalW, areaH: totalH - taskbarPx };
    }
  }
  const { workArea } = monitor;
  return {
    areaX: workArea.position.x,
    areaY: workArea.position.y,
    areaW: workArea.size.width,
    areaH: workArea.size.height,
  };
}

/**
 * Centraliza uma janela na área de trabalho.
 * Passa `override` para evitar leitura de SQLite (útil quando o chamador já tem o config).
 */
export async function centerOnWorkArea(
  win: Window | WebviewWindow,
  fallback?: { width: number; height: number },
  override?: WindowPositionOverride,
): Promise<void> {
  const cfg = override ?? await readPositionConfig();
  const [monitorResult, outerSize] = await Promise.all([
    currentMonitor().then((m) => m ?? primaryMonitor()),
    win.outerSize(),
  ]);
  if (!monitorResult) return;

  const { scaleFactor } = monitorResult;
  const winW = outerSize.width > 0 ? outerSize.width : Math.round((fallback?.width ?? 560) * scaleFactor);
  const winH = outerSize.height > 0 ? outerSize.height : Math.round((fallback?.height ?? 500) * scaleFactor);
  const { areaX, areaY, areaW, areaH } = computeArea(cfg, monitorResult);

  const x = areaX + Math.round((areaW - winW) / 2);
  const y = areaY + Math.round((areaH - winH) / 2);
  await win.setPosition(new PhysicalPosition(x, y));
  setTimeout(() => win.setPosition(new PhysicalPosition(x, y)).catch(() => {}), 150);
}

/**
 * Posiciona uma janela no canto inferior direito da área útil do monitor.
 * Passa `override` para evitar leitura de SQLite (útil quando o chamador já tem o config).
 */
export async function positionNearTaskbar(
  win: Window | WebviewWindow,
  fallback?: { width: number; height: number },
  override?: WindowPositionOverride,
): Promise<void> {
  const cfg = override ?? await readPositionConfig();
  const [monitorResult, outerSize] = await Promise.all([
    currentMonitor().then((m) => m ?? primaryMonitor()),
    win.outerSize(),
  ]);
  if (!monitorResult) return;

  const { scaleFactor } = monitorResult;
  const winW = outerSize.width > 0 ? outerSize.width : Math.round((fallback?.width ?? 800) * scaleFactor);
  const winH = outerSize.height > 0 ? outerSize.height : Math.round((fallback?.height ?? 620) * scaleFactor);
  const { areaX, areaY, areaW, areaH } = computeArea(cfg, monitorResult);

  const x = areaX + Math.max(0, areaW - winW);
  const y = areaY + Math.max(0, areaH - winH);
  await win.setPosition(new PhysicalPosition(x, y));
  setTimeout(() => win.setPosition(new PhysicalPosition(x, y)).catch(() => {}), 150);
}
