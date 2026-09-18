import { useCallback, useEffect, useRef, useState } from "react";

const COPIED_FEEDBACK_MS = 2000;

/**
 * Copia para a área de transferência e mantém `copied` ligado por um instante,
 * para o botão trocar para "Copiado!". Falha de escrita propaga: quem chama
 * decide se avisa. Religar antes do fim reinicia a contagem, e o timer morre com
 * o componente.
 */
export function useCopyFeedback() {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    []
  );

  const copy = useCallback(async (text: string) => {
    await navigator.clipboard.writeText(text);
    if (timer.current) clearTimeout(timer.current);
    setCopied(true);
    timer.current = setTimeout(() => setCopied(false), COPIED_FEEDBACK_MS);
  }, []);

  return { copied, copy };
}
