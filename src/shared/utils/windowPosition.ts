import { currentMonitor, monitorFromPoint, primaryMonitor } from "@tauri-apps/api/window";
import type { Window } from "@tauri-apps/api/window";
import { WebviewWindow } from "@tauri-apps/api/webviewWindow";
import { PhysicalPosition } from "@tauri-apps/api/dpi";

/**
 * Tamanho lógico do popup, em px. **É a altura que ele tem em todo estado**, e
 * não uma estimativa inicial: idle e running medem isto, e o conteúdo se arranja
 * dentro — o card da execução e as abas têm altura própria, e o conteúdo da aba
 * é o `flex-1` que cede o resto (`PopupOverlayContent`).
 *
 * As duas janelas que o posicionam precisam concordar: quem abre o popup é o
 * overlay compacto, e quem o reposiciona depois é ele mesmo. Divergindo, o
 * popup nasce ancorado por uma altura e se desenha com outra — aparecendo
 * deslocado do canto em que o usuário deixou o compacto. Enquanto a altura variou
 * por estado, esta constante era também o **teto** do `setMaxSize` e cortava
 * calada o que passasse dela.
 *
 * **O `overlay-popup` do `tauri.conf.json` repete estes dois números**, e é a
 * terceira cópia — a que ninguém lembra de atualizar, porque o frontend
 * redimensiona no mount e o erro só existe nos primeiros quadros, com a janela
 * ainda escondida. Já divergiu: o conf ficou em 411 px depois que a altura caiu
 * para 380 (2026-08-12). Mexeu aqui, mexa lá.
 */
export const POPUP_SIZE: { width: number; height: number } = { width: 288, height: 380 };

/** Positions the overlay popup adjacent to the compact overlay, screen-quadrant-aware. */
export async function positionPopupNearCompact(
  popup: Window | WebviewWindow,
  logicalSize: { width: number; height: number }
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
  const monitorResult =
    (await monitorFromPoint(cx, cy).catch(() => null)) ?? (await primaryMonitor());
  if (!monitorResult) return;

  const { scaleFactor, size: screenSize, position: screenOrigin } = monitorResult;
  const popupPhysW = Math.round(logicalSize.width * scaleFactor);
  const popupPhysH = Math.round(logicalSize.height * scaleFactor);
  const gapPhys = Math.round(8 * scaleFactor);

  // Prefer right of compact; fall back to left if it would overflow
  let x: number;
  if (
    compactPos.x + compactSize.width + gapPhys + popupPhysW <=
    screenOrigin.x + screenSize.width
  ) {
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

export interface MonitorRect {
  position: { x: number; y: number };
  size: { width: number; height: number };
}

/**
 * Encaixa a janela (canto superior-esquerdo `pos` + `winSize`) inteiramente dentro
 * do retângulo do monitor. Puro — usado para trazer uma posição salva de volta à
 * tela mais próxima sem resetá-la para o canto oposto quando ela cai fora
 * (ex.: monitor externo desconectado).
 */
export function clampIntoMonitor(
  monitor: MonitorRect,
  pos: { x: number; y: number },
  winSize: { width: number; height: number }
): { x: number; y: number } {
  const maxX = monitor.position.x + Math.max(0, monitor.size.width - winSize.width);
  const maxY = monitor.position.y + Math.max(0, monitor.size.height - winSize.height);
  return {
    x: Math.max(monitor.position.x, Math.min(pos.x, maxX)),
    y: Math.max(monitor.position.y, Math.min(pos.y, maxY)),
  };
}

export async function positionNearTaskbar(
  win: Window | WebviewWindow,
  fallback?: { width: number; height: number }
): Promise<void> {
  const [monitorResult, outerSize] = await Promise.all([
    currentMonitor().then((m) => m ?? primaryMonitor()),
    win.outerSize(),
  ]);
  if (!monitorResult) return;

  const { scaleFactor, workArea } = monitorResult;
  const winW =
    outerSize.width > 0 ? outerSize.width : Math.round((fallback?.width ?? 800) * scaleFactor);
  const winH =
    outerSize.height > 0 ? outerSize.height : Math.round((fallback?.height ?? 620) * scaleFactor);

  const x = workArea.position.x + Math.max(0, workArea.size.width - winW);
  const y = workArea.position.y + Math.max(0, workArea.size.height - winH);
  await win.setPosition(new PhysicalPosition(x, y));
  setTimeout(() => win.setPosition(new PhysicalPosition(x, y)).catch(() => {}), 150);
}
