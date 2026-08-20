import { useEffect } from "react";

/**
 * ESC fecha o modal. Vale para **todos** eles: um modal que não fecha no ESC é
 * o único da tela que não fecha, e o usuário só descobre qual é tentando.
 *
 * O listener é da janela, não do container, porque o foco pode estar num input,
 * num autocomplete aberto ou em lugar nenhum. Quem precisa do ESC para outra
 * coisa antes — o `Autocomplete` fecha o dropdown — consome a tecla com
 * `preventDefault`, e é isso que o `defaultPrevented` daqui respeita: sem ele,
 * um ESC no autocomplete aberto fecharia o modal inteiro junto.
 */
export function useEscapeToClose(onClose: () => void): void {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && !e.defaultPrevented) onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
}
