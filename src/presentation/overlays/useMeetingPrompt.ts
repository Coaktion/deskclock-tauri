import { useCallback, useEffect, useRef, useState } from "react";
import { emit, listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { positionPopupNearCompact } from "@shared/utils/windowPosition";
import {
  OVERLAY_EVENTS,
  type MeetingPromptPayload,
  type MeetingPromptResponsePayload,
} from "@shared/types/overlayEvents";

const appWindow = getCurrentWindow();

/**
 * Recebe prompts de reunião (MEETING_PROMPT) na janela do popup, exibindo-a
 * próxima ao overlay compact, e devolve a resposta do usuário à janela principal.
 *
 * Expõe `activeRef` para que a janela do popup evite auto-ocultar (blur) enquanto
 * um prompt estiver ativo — o prompt não depende de foco para permanecer visível.
 */
export function useMeetingPrompt(popupSize: { width: number; height: number }) {
  const [prompt, setPrompt] = useState<MeetingPromptPayload | null>(null);
  const activeRef = useRef(false);

  useEffect(() => {
    const unlisten = listen<MeetingPromptPayload>(
      OVERLAY_EVENTS.MEETING_PROMPT,
      async ({ payload }) => {
        activeRef.current = true;
        setPrompt(payload);
        await positionPopupNearCompact(appWindow, popupSize);
        // O aviso aparece por conta própria, no meio do que o usuário está
        // fazendo: chegar com foco tira o teclado da janela em que ele digita.
        // Tirar só o `setFocus()` não basta — no Windows o próprio `show()`
        // ativa a janela —, então quem resolve é nascer não-ativável. Os botões
        // continuam clicáveis (o prompt é só botão, não depende de teclado) e o
        // guard de blur de `PopupOverlayApp` segue valendo.
        await appWindow.setFocusable(false);
        await appWindow.show();
      }
    );
    return () => {
      unlisten.then((fn) => fn());
    };
  }, [popupSize]);

  const respond = useCallback(
    async (action: MeetingPromptResponsePayload["action"]) => {
      if (!prompt) return;
      await emit(OVERLAY_EVENTS.MEETING_PROMPT_RESPONSE, {
        kind: prompt.kind,
        calendarEventId: prompt.calendarEventId,
        action,
      } satisfies MeetingPromptResponsePayload);
      activeRef.current = false;
      setPrompt(null);
      await appWindow.hide();
      // A não-ativação vale só enquanto o aviso está na tela: no uso normal o
      // popup depende de foco — fechar no blur, digitar no omnibox.
      await appWindow.setFocusable(true);
    },
    [prompt]
  );

  return { prompt, respond, activeRef };
}
