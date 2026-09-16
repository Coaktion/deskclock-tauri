import { useEffect, useRef, useState, type CSSProperties } from "react";

/** Folga entre a borda de baixo do gatilho e o topo do painel. */
const GAP = 4;

export interface AnchoredPanelOptions {
  /**
   * O painel nasce com pelo menos a largura do gatilho — o dropdown que se
   * alinha ao campo que o abriu. O flyout não quer: ele sai de uma pílula de
   * ~44px, e copiá-la espremeria os chips numa coluna.
   */
  matchTriggerWidth?: boolean;
  /**
   * Rolar fecha o painel. Só quem vive dentro de um scroller precisa: as
   * coordenadas são fixas, tiradas de um `getBoundingClientRect` do instante da
   * abertura, e rolar a lista descolaria o painel da linha que o abriu.
   */
  closeOnScroll?: boolean;
}

/**
 * Painel que abre ancorado num gatilho e vai para `document.body` por portal —
 * o mecanismo comum do `TagMultiSelect` e do `PlannedActionsFlyout`, que o
 * escreviam duas vezes (§9.4).
 *
 * **A posição é medida uma vez, no clique que abre.** Em `position: fixed` com
 * as coordenadas do rect, qualquer coisa que mova o gatilho depois disso
 * descola o painel — daí as duas guardas serem fechar, e não reposicionar:
 * reposicionar exigiria remedir a cada quadro de rolagem, e o painel que se
 * arrasta atrás da linha não é melhor do que o que sai da frente.
 *
 * O **resize** vale para os dois call sites, e não é escolha: o `right` é
 * medido contra o `window.innerWidth` do momento da abertura, então redimensionar
 * a janela desloca o painel horizontalmente inteiro.
 */
export function useAnchoredPanel<T extends HTMLElement>({
  matchTriggerWidth = false,
  closeOnScroll = false,
}: AnchoredPanelOptions = {}) {
  const [open, setOpen] = useState(false);
  const [panelStyle, setPanelStyle] = useState<CSSProperties>({});
  const triggerRef = useRef<T>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  function openPanel() {
    const trigger = triggerRef.current;
    if (trigger) {
      const r = trigger.getBoundingClientRect();
      setPanelStyle({
        position: "fixed",
        top: r.bottom + GAP,
        right: window.innerWidth - r.right,
        ...(matchTriggerWidth ? { minWidth: r.width } : {}),
      });
    } else {
      // O estilo da abertura anterior não pode sobreviver a uma abertura sem
      // gatilho montado: ele reabriria o painel nas coordenadas velhas, num
      // ponto da tela que não tem mais relação com nada.
      setPanelStyle({});
    }
    setOpen(true);
  }

  useEffect(() => {
    if (!open) return;

    function handleOutside(e: MouseEvent) {
      const target = e.target as Node;
      if (!triggerRef.current?.contains(target) && !panelRef.current?.contains(target)) {
        setOpen(false);
      }
    }

    function close() {
      setOpen(false);
    }

    document.addEventListener("mousedown", handleOutside);
    window.addEventListener("resize", close);
    // A fase de **captura** é o que alcança o scroller ancestral: `scroll` não
    // borbulha. O `capture` tem de aparecer também na remoção, ou o par não bate
    // e o listener fica pendurado na janela depois de fechar.
    if (closeOnScroll) window.addEventListener("scroll", close, { capture: true });

    return () => {
      document.removeEventListener("mousedown", handleOutside);
      window.removeEventListener("resize", close);
      if (closeOnScroll) window.removeEventListener("scroll", close, { capture: true });
    };
  }, [open, closeOnScroll]);

  return { open, setOpen, triggerRef, panelRef, panelStyle, openPanel };
}
