import { currentMonitor, primaryMonitor } from "@tauri-apps/api/window";
import type { Window } from "@tauri-apps/api/window";
import type { WebviewWindow } from "@tauri-apps/api/webviewWindow";
import { PhysicalPosition } from "@tauri-apps/api/dpi";

/**
 * Posiciona uma janela no canto inferior direito da área útil do monitor.
 * Usa monitor.workArea (pixels físicos) que já exclui qualquer barra de
 * tarefas/painel, independente de onde ela estiver (topo, base, lados).
 *
 * @param fallback Tamanho lógico de fallback caso outerSize() retorne 0 (janela
 *   oculta ainda não realizada pelo GTK). O valor é convertido para físico via
 *   scaleFactor do monitor.
 */
export async function positionNearTaskbar(
  win: Window | WebviewWindow,
  fallback?: { width: number; height: number },
): Promise<void> {
  // currentMonitor() retorna null para janelas ocultas no GTK/Linux — fallback para primaryMonitor()
  const [monitorResult, outerSize] = await Promise.all([
    currentMonitor().then((m) => m ?? primaryMonitor()),
    win.outerSize(),
  ]);
  const monitor = monitorResult;

  if (!monitor) return;

  const { workArea, scaleFactor } = monitor;

  const winW =
    outerSize.width > 0
      ? outerSize.width
      : Math.round((fallback?.width ?? 800) * scaleFactor);
  const winH =
    outerSize.height > 0
      ? outerSize.height
      : Math.round((fallback?.height ?? 620) * scaleFactor);

  const x = workArea.position.x + Math.max(0, workArea.size.width - winW);
  const y = workArea.position.y + Math.max(0, workArea.size.height - winH);

  await win.setPosition(new PhysicalPosition(x, y));
}
