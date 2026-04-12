import { emit } from "@tauri-apps/api/event";
import { WebviewWindow } from "@tauri-apps/api/webviewWindow";
import {
  OVERLAY_EVENTS,
  type ToastVariant,
  type ToastMessagePayload,
} from "@shared/types/overlayEvents";

export async function showToast(
  variant: ToastVariant,
  message: string,
  duration = 3500,
  actionLabel?: string,
  actionEvent?: string
): Promise<void> {
  const win = await WebviewWindow.getByLabel("toast");
  if (!win) return;
  await win.show();
  // Pequeno delay para garantir que a janela está pronta para receber eventos
  await new Promise((r) => setTimeout(r, 50));
  await emit(OVERLAY_EVENTS.TOAST_MESSAGE, {
    variant,
    message,
    duration,
    actionLabel,
    actionEvent,
  } satisfies ToastMessagePayload);
}
