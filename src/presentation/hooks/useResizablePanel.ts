import { useAppConfig } from "@presentation/contexts/ConfigContext";
import type { AppConfig, ConfigKey } from "@shared/types/appConfig";
import { useCallback, useEffect, useRef, useState } from "react";

/** Só as chaves numéricas da config — as outras não têm tamanho a guardar. */
export type NumberConfigKey = {
  [K in ConfigKey]: AppConfig[K] extends number ? K : never;
}[ConfigKey];

/**
 * Quanto o arraste precisa passar **abaixo** do mínimo para recolher o painel.
 * Sem essa folga, quem só quer o painel no menor tamanho possível o recolhe sem
 * querer — o mínimo é justamente o destino mais procurado do arraste.
 */
const COLLAPSE_SLACK = 40;

/** Passo das setas do teclado. Grosso o bastante para chegar ao fim sem cansar. */
const KEYBOARD_STEP = 16;

/**
 * Em que borda o painel está encostado — ou, dito de outro jeito, de que lado do
 * divisor ele fica. É a única prop de geometria porque dela sai tudo o mais: o
 * eixo do arraste, o sinal (crescer é para longe da borda), o cursor, as setas
 * que respondem e a orientação ARIA do separador. Duas props (eixo e sentido)
 * abririam a chance de combiná-las ao contrário.
 */
export type PanelAnchor = "left" | "right" | "top" | "bottom";

const ANCHORS: Record<PanelAnchor, { axis: "x" | "y"; sign: 1 | -1 }> = {
  left: { axis: "x", sign: 1 },
  right: { axis: "x", sign: -1 },
  top: { axis: "y", sign: 1 },
  bottom: { axis: "y", sign: -1 },
};

export interface ResizablePanelOptions {
  /** Chave da config onde o tamanho fica gravado. */
  key: NumberConfigKey;
  min: number;
  max: number;
  defaultSize: number;
  /** Padrão `left`: coluna à esquerda, em que arrastar para a direita cresce. */
  anchor?: PanelAnchor;
  /**
   * Chamado quando o arraste passa de `min - COLLAPSE_SLACK`. Opcional: sem ele,
   * o arraste apenas trava no mínimo. Quem recolhe é o dono do estado recolhido,
   * porque ele é persistido em outra chave.
   */
  onCollapse?: () => void;
}

type DragState = { pointerId: number; originPos: number; originSize: number };

/**
 * Painel que o usuário redimensiona arrastando um divisor, com o tamanho
 * persistido na config — mesma razão do `usePersistedFlag`: quem ajustou a
 * largura quer trabalhar assim, não por uma sessão só.
 *
 * Três decisões que valem registro:
 *
 * **O arraste usa pointer capture, não listener no `document`.** Capturado, o
 * ponteiro entrega os eventos ao próprio divisor mesmo saindo da janela ou
 * passando por cima de um iframe — o que um `mousemove` global só resolve com
 * um par de listeners que precisam ser removidos na mão em todo caminho de
 * saída (incluindo o desmonte no meio do arraste).
 *
 * **Persistir é no soltar, nunca no mover.** `config.set` grava no SQLite, e um
 * `UPDATE` por quadro de arraste é o custo mais fácil de evitar aqui. O estado
 * na tela acompanha o movimento; só o registro espera.
 *
 * **Recolher pelo arraste não persiste a largura encolhida.** O painel volta na
 * largura em que estava antes — o gesto pediu para sumir, não para reabrir
 * espremido.
 */
export function useResizablePanel({
  key,
  min,
  max,
  defaultSize,
  anchor = "left",
  onCollapse,
}: ResizablePanelOptions) {
  const config = useAppConfig();
  const { axis, sign } = ANCHORS[anchor];
  /** O divisor entre painéis lado a lado é vertical; entre empilhados, horizontal. */
  const orientation: "vertical" | "horizontal" = axis === "x" ? "vertical" : "horizontal";

  const [size, setSize] = useState(defaultSize);
  const [isDragging, setIsDragging] = useState(false);

  // Espelho do tamanho para os handlers: o `pointerup` precisa gravar o valor
  // corrente, e lê-lo do closure devolveria o do render em que o arraste começou.
  const sizeRef = useRef(defaultSize);
  const dragRef = useRef<DragState | null>(null);

  const clamp = useCallback((n: number) => Math.min(max, Math.max(min, n)), [min, max]);

  const apply = useCallback((next: number) => {
    sizeRef.current = next;
    setSize(next);
  }, []);

  // `config` fora das dependências pelo mesmo motivo do `usePersistedFlag`: o
  // provider devolve objeto novo a cada render, e reagir a ele reescreveria o
  // tamanho no meio do arraste. O que importa é o instante em que a carga acaba.
  useEffect(() => {
    if (!config.isLoaded) return;
    const stored = config.get(key);
    // Zero é o valor de uma chave que nunca foi escrita, e clampá-lo daria o
    // mínimo em vez do padrão — o painel nasceria estreito para todo mundo.
    apply(clamp(stored > 0 ? stored : defaultSize));
  }, [config.isLoaded, key]); // eslint-disable-line react-hooks/exhaustive-deps

  const commit = useCallback(
    (next: number) => {
      apply(next);
      void config.set(key, next);
    },
    [apply, config, key]
  );

  /**
   * Enquanto arrasta, o cursor e a seleção valem para a janela inteira: sem
   * isso o cursor pisca ao passar sobre os campos e o arraste seleciona o texto
   * por onde passa. O ponteiro está capturado, então o alvo real dos eventos
   * continua sendo o divisor — o que muda aqui é só a aparência.
   */
  const lockWindow = (locked: boolean) => {
    document.body.style.userSelect = locked ? "none" : "";
    document.body.style.cursor = locked ? (axis === "x" ? "col-resize" : "row-resize") : "";
  };

  const endDrag = (el: Element, pointerId: number) => {
    dragRef.current = null;
    setIsDragging(false);
    lockWindow(false);
    if (el.hasPointerCapture(pointerId)) el.releasePointerCapture(pointerId);
  };

  // Desmontar no meio do arraste (trocar de tela por atalho, por exemplo)
  // deixaria a janela inteira sem seleção e com cursor de redimensionar. A
  // restauração é escrita à mão em vez de chamar `lockWindow`: a função é
  // recriada a cada render, e depender dela faria a limpeza rodar em todo render
  // — reagir ao desmonte é justamente o que se quer aqui.
  useEffect(
    () => () => {
      document.body.style.userSelect = "";
      document.body.style.cursor = "";
    },
    []
  );

  /** A coordenada que interessa neste eixo. */
  const posOf = (e: React.PointerEvent<HTMLElement>) => (axis === "x" ? e.clientX : e.clientY);

  const onPointerDown = (e: React.PointerEvent<HTMLElement>) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    dragRef.current = {
      pointerId: e.pointerId,
      originPos: posOf(e),
      originSize: sizeRef.current,
    };
    setIsDragging(true);
    lockWindow(true);
  };

  const onPointerMove = (e: React.PointerEvent<HTMLElement>) => {
    const drag = dragRef.current;
    if (!drag || e.pointerId !== drag.pointerId) return;

    const raw = drag.originSize + (posOf(e) - drag.originPos) * sign;

    if (onCollapse && raw < min - COLLAPSE_SLACK) {
      endDrag(e.currentTarget, e.pointerId);
      onCollapse();
      return;
    }

    apply(clamp(raw));
  };

  const onPointerEnd = (e: React.PointerEvent<HTMLElement>) => {
    const drag = dragRef.current;
    if (!drag || e.pointerId !== drag.pointerId) return;
    endDrag(e.currentTarget, e.pointerId);
    void config.set(key, sizeRef.current);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLElement>) => {
    if (e.key === "Home") {
      e.preventDefault();
      commit(defaultSize);
      return;
    }
    // Só as setas do próprio eixo respondem: num divisor horizontal, a seta para
    // a direita não tem para onde levar, e consumi-la roubaria a tecla de quem
    // estiver navegando a tela.
    const [less, more] = axis === "x" ? ["ArrowLeft", "ArrowRight"] : ["ArrowUp", "ArrowDown"];
    const step = e.key === less ? -1 : e.key === more ? 1 : 0;
    if (step === 0) return;
    e.preventDefault();
    commit(clamp(sizeRef.current + step * KEYBOARD_STEP * sign));
  };

  const reset = useCallback(() => commit(defaultSize), [commit, defaultSize]);

  return {
    size,
    isDragging,
    reset,
    /**
     * Espalhe no `<ResizeHandle>` — traz os gestos e a semântica de separador.
     * O `aria-orientation` daqui é também o que diz ao handle como se desenhar,
     * então não há como os dois discordarem.
     */
    handleProps: {
      role: "separator" as const,
      "aria-orientation": orientation,
      "aria-valuenow": Math.round(size),
      "aria-valuemin": min,
      "aria-valuemax": max,
      tabIndex: 0,
      onPointerDown,
      onPointerMove,
      onPointerUp: onPointerEnd,
      onPointerCancel: onPointerEnd,
      onKeyDown,
      onDoubleClick: reset,
    },
  };
}
