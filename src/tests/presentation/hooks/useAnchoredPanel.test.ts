import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useAnchoredPanel } from "@presentation/hooks/useAnchoredPanel";

/**
 * Este é o ganho da extração. Dentro do componente de tela, posicionar o painel
 * e decidir o que o fecha era lógica intestável pela política do repo
 * (`docs-internal/testes.md`); no hook, é exatamente o que ela manda testar — e
 * o que a cópia fazia divergir em silêncio entre os dois call sites.
 */

/** Largura da janela contra a qual o `right` do painel é medido. */
const WINDOW_WIDTH = 1000;

/**
 * O gatilho medido. `contains` devolve `false` porque o teste de clique-fora
 * pergunta justamente isso; quem precisa do `true` passa o seu.
 */
function makeTrigger(
  rect: { bottom: number; right: number; width: number },
  contains = false
): HTMLElement {
  return {
    getBoundingClientRect: () => rect,
    contains: () => contains,
  } as unknown as HTMLElement;
}

const RECT = { bottom: 100, right: 400, width: 120 };

beforeEach(() => {
  Object.defineProperty(window, "innerWidth", {
    configurable: true,
    writable: true,
    value: WINDOW_WIDTH,
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("useAnchoredPanel", () => {
  it("nasce fechado, abre no gatilho e fecha quando mandam fechar", () => {
    const { result } = renderHook(() => useAnchoredPanel<HTMLElement>());
    result.current.triggerRef.current = makeTrigger(RECT);

    expect(result.current.open).toBe(false);

    act(() => result.current.openPanel());
    expect(result.current.open).toBe(true);

    act(() => result.current.setOpen(false));
    expect(result.current.open).toBe(false);
  });

  it("ancora o painel na borda de baixo do gatilho e no alinhamento à direita", () => {
    const { result } = renderHook(() => useAnchoredPanel<HTMLElement>());
    result.current.triggerRef.current = makeTrigger(RECT);

    act(() => result.current.openPanel());

    expect(result.current.panelStyle.position).toBe("fixed");
    expect(result.current.panelStyle.top).toBe(104);
    expect(result.current.panelStyle.right).toBe(WINDOW_WIDTH - RECT.right);
    // Sem a opção, o painel não herda largura nenhuma: o ⚡ sai de uma pílula
    // estreita, e copiá-la empilharia os chips numa coluna.
    expect(result.current.panelStyle.minWidth).toBeUndefined();
  });

  it("com matchTriggerWidth, o painel nasce com pelo menos a largura do gatilho", () => {
    const { result } = renderHook(() => useAnchoredPanel<HTMLElement>({ matchTriggerWidth: true }));
    result.current.triggerRef.current = makeTrigger(RECT);

    act(() => result.current.openPanel());

    expect(result.current.panelStyle.minWidth).toBe(RECT.width);
  });

  it("abre mesmo sem gatilho medido, e aí não posiciona nada", () => {
    const { result } = renderHook(() => useAnchoredPanel<HTMLElement>());

    act(() => result.current.openPanel());

    expect(result.current.open).toBe(true);
    expect(result.current.panelStyle.top).toBeUndefined();
  });

  it("reabrir sem gatilho não herda as coordenadas da abertura anterior", () => {
    const { result } = renderHook(() => useAnchoredPanel<HTMLElement>());
    result.current.triggerRef.current = makeTrigger(RECT);
    act(() => result.current.openPanel());
    expect(result.current.panelStyle.top).toBe(104);

    result.current.triggerRef.current = null;
    act(() => result.current.openPanel());

    // Sobrevivendo, o estilo velho reabriria o painel num ponto da tela que já
    // não tem relação com gatilho nenhum.
    expect(result.current.panelStyle.top).toBeUndefined();
  });

  it("o mousedown no próprio gatilho não fecha", () => {
    const { result } = renderHook(() => useAnchoredPanel<HTMLElement>());
    result.current.triggerRef.current = makeTrigger(RECT, true);
    act(() => result.current.openPanel());

    result.current.panelRef.current = {
      contains: () => false,
    } as unknown as HTMLDivElement;
    act(() => {
      document.dispatchEvent(new MouseEvent("mousedown"));
    });

    // Fechar aqui faria o `click` seguinte reabrir o que o `mousedown` acabou de
    // fechar: o gatilho piscaria em vez de alternar, e é por isso que o
    // `handleOutside` pergunta pelo gatilho antes de decidir.
    expect(result.current.open).toBe(true);
  });

  it("o clique fora fecha, e o clique dentro do painel não", () => {
    const { result } = renderHook(() => useAnchoredPanel<HTMLElement>());
    result.current.triggerRef.current = makeTrigger(RECT);
    act(() => result.current.openPanel());

    result.current.panelRef.current = {
      contains: () => true,
    } as unknown as HTMLDivElement;
    act(() => {
      document.dispatchEvent(new MouseEvent("mousedown"));
    });
    expect(result.current.open).toBe(true);

    result.current.panelRef.current = {
      contains: () => false,
    } as unknown as HTMLDivElement;
    act(() => {
      document.dispatchEvent(new MouseEvent("mousedown"));
    });
    expect(result.current.open).toBe(false);
  });

  it("com closeOnScroll, rolar fecha — as coordenadas são fixas", () => {
    const { result } = renderHook(() => useAnchoredPanel<HTMLElement>({ closeOnScroll: true }));
    result.current.triggerRef.current = makeTrigger(RECT);
    act(() => result.current.openPanel());

    act(() => {
      window.dispatchEvent(new Event("scroll"));
    });

    expect(result.current.open).toBe(false);
  });

  it("sem closeOnScroll, rolar não fecha — o gatilho não vive num scroller", () => {
    const { result } = renderHook(() => useAnchoredPanel<HTMLElement>());
    result.current.triggerRef.current = makeTrigger(RECT);
    act(() => result.current.openPanel());

    act(() => {
      window.dispatchEvent(new Event("scroll"));
    });

    expect(result.current.open).toBe(true);
  });

  it("redimensionar a janela fecha nos dois modos", () => {
    for (const closeOnScroll of [false, true]) {
      const { result } = renderHook(() => useAnchoredPanel<HTMLElement>({ closeOnScroll }));
      result.current.triggerRef.current = makeTrigger(RECT);
      act(() => result.current.openPanel());

      act(() => {
        window.dispatchEvent(new Event("resize"));
      });

      expect(result.current.open).toBe(false);
    }
  });

  it("desmontar aberto leva todos os listeners junto", () => {
    const offWindow = vi.spyOn(window, "removeEventListener");
    const offDocument = vi.spyOn(document, "removeEventListener");

    const { result, unmount } = renderHook(() =>
      useAnchoredPanel<HTMLElement>({ closeOnScroll: true })
    );
    result.current.triggerRef.current = makeTrigger(RECT);
    act(() => result.current.openPanel());

    unmount();

    expect(offDocument).toHaveBeenCalledWith("mousedown", expect.any(Function));
    expect(offWindow).toHaveBeenCalledWith("resize", expect.any(Function));
    // O `capture` tem de aparecer também aqui, ou o par não bate e o listener
    // de rolagem fica pendurado na janela depois do desmonte.
    expect(offWindow).toHaveBeenCalledWith("scroll", expect.any(Function), { capture: true });
  });
});
