import { useEffect, useRef, useState } from "react";
import { emit, listen } from "@tauri-apps/api/event";

/** Frase mostrada abaixo do botão de busca manual. */
export interface SyncFeedback {
  ok: boolean;
  text: string;
}

// Rede lenta com muitos boards leva minutos; o corte existe só para o botão não
// ficar travado para sempre quando ninguém responde.
const SYNC_TIMEOUT_MS = 3 * 60 * 1000;

/**
 * Botão de "buscar agora" de uma integração cujo trabalho vive noutro lugar.
 *
 * Quem busca é o rastreador, na janela principal, e o fim chega por evento — o
 * botão sozinho não tem como saber que a busca acabou.
 *
 * **O watchdog não é luxo.** O rastreador registra o listener dentro de um efeito
 * que espera config e workspace resolverem: um clique nessa janela é emitido no
 * vazio, e sem o corte por tempo o botão giraria até a tela remontar. Vale também
 * para o rastreador fora do ar por qualquer outro motivo.
 */
export function useSyncNowButton<P>(
  requestEvent: string,
  resultEvent: string,
  describe: (payload: P) => SyncFeedback | null
) {
  const [searching, setSearching] = useState(false);
  const [feedback, setFeedback] = useState<SyncFeedback | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // `describe` é recriado a cada render; o ref evita reassinar o listener a cada
  // um sem obrigar cada chamador a memoizar a função.
  const describeRef = useRef(describe);
  describeRef.current = describe;

  useEffect(() => {
    const unlisten = listen<P>(resultEvent, (event) => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      setSearching(false);
      setFeedback(describeRef.current(event.payload));
    });
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      void unlisten.then((fn) => fn());
    };
  }, [resultEvent]);

  async function trigger() {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    setFeedback(null);
    setSearching(true);
    timeoutRef.current = setTimeout(() => {
      setSearching(false);
      setFeedback({ ok: false, text: "A busca não respondeu a tempo. Tente novamente." });
    }, SYNC_TIMEOUT_MS);
    await emit(requestEvent, {});
  }

  /** Exposto para a tela semear a frase com o resultado que ficou na config. */
  return { searching, feedback, setFeedback, trigger };
}
