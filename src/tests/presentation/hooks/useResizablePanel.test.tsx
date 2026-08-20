import type { IConfigRepository } from "@domain/repositories/IConfigRepository";
import { ConfigProvider } from "@presentation/contexts/ConfigContext";
import { useResizablePanel } from "@presentation/hooks/useResizablePanel";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

/**
 * As três chaves de tamanho voltam **zeradas**, e é isso que faz o teste medir o
 * `defaultSize` que ele mesmo passa. Zero é o valor de uma chave nunca escrita, e
 * o hook o traduz para o padrão — o caminho documentado.
 *
 * Sem isso o `ConfigProvider` (que é o de verdade aqui) devolve o `DEFAULTS`
 * dele, e cada expectativa deste arquivo passaria a depender da largura que a
 * coluna do Planejamento tem na app. Elas concordavam por coincidência de dois
 * literais, e a coincidência acabou quando a coluna foi para os 280px do design.
 */
function makeRepo(overrides: Partial<IConfigRepository> = {}): IConfigRepository {
  return {
    get: vi.fn((_key, defaultValue) => Promise.resolve(defaultValue)),
    loadAll: vi.fn(() =>
      Promise.resolve({
        planningFormWidth: 0,
        retroactiveFormWidth: 0,
        retroactivePlannedHeight: 0,
      })
    ),
    set: vi.fn(() => Promise.resolve()),
    delete: vi.fn(() => Promise.resolve()),
    ...overrides,
  };
}

function wrapperWith(repo: IConfigRepository) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return <ConfigProvider repository={repo}>{children}</ConfigProvider>;
  };
}

const OPTIONS = {
  key: "planningFormWidth",
  min: 224,
  max: 560,
  defaultSize: 256,
} as const;

/**
 * O elemento que recebe os gestos. `setPointerCapture` e companhia não existem
 * no jsdom, e o hook os chama em todo arraste — sem os stubs, o primeiro
 * `pointerdown` derruba o teste por método ausente.
 */
function makeHandle() {
  const captured = new Set<number>();
  return {
    setPointerCapture: (id: number) => captured.add(id),
    releasePointerCapture: (id: number) => captured.delete(id),
    hasPointerCapture: (id: number) => captured.has(id),
  } as unknown as HTMLElement;
}

function pointerEvent(handle: HTMLElement, clientX: number, button = 0) {
  return {
    button,
    pointerId: 1,
    clientX,
    // Os dois eixos recebem a mesma coordenada: o teste do eixo Y usa este mesmo
    // helper, e o hook lê só a que corresponde ao seu `anchor`.
    clientY: clientX,
    currentTarget: handle,
    preventDefault: vi.fn(),
  } as unknown as React.PointerEvent<HTMLElement>;
}

function keyEvent(key: string) {
  return { key, preventDefault: vi.fn() } as unknown as React.KeyboardEvent<HTMLElement>;
}

describe("useResizablePanel", () => {
  it("assume o padrão enquanto a config não carregou", () => {
    const repo = makeRepo({
      loadAll: vi.fn(() => new Promise<Record<string, unknown>>(() => {})),
    });
    const { result } = renderHook(() => useResizablePanel(OPTIONS), {
      wrapper: wrapperWith(repo),
    });

    expect(result.current.size).toBe(256);
  });

  it("adota a largura gravada assim que a config carrega", async () => {
    const repo = makeRepo({ loadAll: vi.fn(() => Promise.resolve({ planningFormWidth: 400 })) });
    const { result } = renderHook(() => useResizablePanel(OPTIONS), {
      wrapper: wrapperWith(repo),
    });

    await waitFor(() => expect(result.current.size).toBe(400));
  });

  it("cai no padrão quando a chave nunca foi escrita, em vez de clampar para o mínimo", async () => {
    const repo = makeRepo({ loadAll: vi.fn(() => Promise.resolve({ planningFormWidth: 0 })) });
    const { result } = renderHook(() => useResizablePanel(OPTIONS), {
      wrapper: wrapperWith(repo),
    });

    await waitFor(() => expect(result.current.size).toBe(256));
  });

  it("clampa a largura gravada fora dos limites", async () => {
    const repo = makeRepo({ loadAll: vi.fn(() => Promise.resolve({ planningFormWidth: 9000 })) });
    const { result } = renderHook(() => useResizablePanel(OPTIONS), {
      wrapper: wrapperWith(repo),
    });

    await waitFor(() => expect(result.current.size).toBe(560));
  });

  it("arrastar acompanha o ponteiro e só persiste ao soltar", async () => {
    const repo = makeRepo();
    const handle = makeHandle();
    const { result } = renderHook(() => useResizablePanel(OPTIONS), {
      wrapper: wrapperWith(repo),
    });
    await waitFor(() => expect(result.current.size).toBe(256));

    act(() => result.current.handleProps.onPointerDown(pointerEvent(handle, 100)));
    act(() => result.current.handleProps.onPointerMove(pointerEvent(handle, 150)));

    expect(result.current.size).toBe(306);
    expect(result.current.isDragging).toBe(true);
    expect(repo.set).not.toHaveBeenCalledWith("planningFormWidth", expect.anything());

    act(() => result.current.handleProps.onPointerUp(pointerEvent(handle, 150)));

    expect(result.current.isDragging).toBe(false);
    expect(repo.set).toHaveBeenCalledWith("planningFormWidth", 306);
  });

  it("o arraste trava nos limites", async () => {
    const repo = makeRepo();
    const handle = makeHandle();
    const { result } = renderHook(() => useResizablePanel(OPTIONS), {
      wrapper: wrapperWith(repo),
    });
    await waitFor(() => expect(result.current.size).toBe(256));

    act(() => result.current.handleProps.onPointerDown(pointerEvent(handle, 100)));
    act(() => result.current.handleProps.onPointerMove(pointerEvent(handle, 900)));

    expect(result.current.size).toBe(560);
  });

  it("sem onCollapse, arrastar bem abaixo do mínimo apenas trava no mínimo", async () => {
    const repo = makeRepo();
    const handle = makeHandle();
    const { result } = renderHook(() => useResizablePanel(OPTIONS), {
      wrapper: wrapperWith(repo),
    });
    await waitFor(() => expect(result.current.size).toBe(256));

    act(() => result.current.handleProps.onPointerDown(pointerEvent(handle, 300)));
    act(() => result.current.handleProps.onPointerMove(pointerEvent(handle, 0)));

    expect(result.current.size).toBe(224);
    expect(result.current.isDragging).toBe(true);
  });

  it("com onCollapse, o arraste fundo recolhe e não persiste a largura encolhida", async () => {
    const repo = makeRepo();
    const handle = makeHandle();
    const onCollapse = vi.fn();
    const { result } = renderHook(() => useResizablePanel({ ...OPTIONS, onCollapse }), {
      wrapper: wrapperWith(repo),
    });
    await waitFor(() => expect(result.current.size).toBe(256));

    act(() => result.current.handleProps.onPointerDown(pointerEvent(handle, 300)));
    act(() => result.current.handleProps.onPointerMove(pointerEvent(handle, 0)));

    expect(onCollapse).toHaveBeenCalledTimes(1);
    expect(result.current.isDragging).toBe(false);
    expect(result.current.size).toBe(256);
    expect(repo.set).not.toHaveBeenCalledWith("planningFormWidth", expect.anything());
  });

  it("dentro da folga, o arraste ainda não recolhe", async () => {
    const repo = makeRepo();
    const handle = makeHandle();
    const onCollapse = vi.fn();
    const { result } = renderHook(() => useResizablePanel({ ...OPTIONS, onCollapse }), {
      wrapper: wrapperWith(repo),
    });
    await waitFor(() => expect(result.current.size).toBe(256));

    // 256 − 50 = 206, ainda acima de min − COLLAPSE_SLACK (224 − 40 = 184).
    act(() => result.current.handleProps.onPointerDown(pointerEvent(handle, 300)));
    act(() => result.current.handleProps.onPointerMove(pointerEvent(handle, 250)));

    expect(onCollapse).not.toHaveBeenCalled();
    expect(result.current.size).toBe(224);
  });

  it("ignora o movimento fora de um arraste em curso", async () => {
    const repo = makeRepo();
    const handle = makeHandle();
    const { result } = renderHook(() => useResizablePanel(OPTIONS), {
      wrapper: wrapperWith(repo),
    });
    await waitFor(() => expect(result.current.size).toBe(256));

    act(() => result.current.handleProps.onPointerMove(pointerEvent(handle, 800)));

    expect(result.current.size).toBe(256);
  });

  it("ignora botão que não é o principal", async () => {
    const repo = makeRepo();
    const handle = makeHandle();
    const { result } = renderHook(() => useResizablePanel(OPTIONS), {
      wrapper: wrapperWith(repo),
    });
    await waitFor(() => expect(result.current.size).toBe(256));

    act(() => result.current.handleProps.onPointerDown(pointerEvent(handle, 100, 2)));
    act(() => result.current.handleProps.onPointerMove(pointerEvent(handle, 400)));

    expect(result.current.size).toBe(256);
  });

  it("as setas ajustam e persistem na hora, e Home volta ao padrão", async () => {
    const repo = makeRepo({ loadAll: vi.fn(() => Promise.resolve({ planningFormWidth: 300 })) });
    const { result } = renderHook(() => useResizablePanel(OPTIONS), {
      wrapper: wrapperWith(repo),
    });
    await waitFor(() => expect(result.current.size).toBe(300));

    act(() => result.current.handleProps.onKeyDown(keyEvent("ArrowRight")));
    expect(result.current.size).toBe(316);
    expect(repo.set).toHaveBeenCalledWith("planningFormWidth", 316);

    act(() => result.current.handleProps.onKeyDown(keyEvent("ArrowLeft")));
    expect(result.current.size).toBe(300);

    act(() => result.current.handleProps.onKeyDown(keyEvent("Home")));
    expect(result.current.size).toBe(256);
    expect(repo.set).toHaveBeenLastCalledWith("planningFormWidth", 256);
  });

  it("tecla sem função não mexe na largura", async () => {
    const repo = makeRepo();
    const { result } = renderHook(() => useResizablePanel(OPTIONS), {
      wrapper: wrapperWith(repo),
    });
    await waitFor(() => expect(result.current.size).toBe(256));

    act(() => result.current.handleProps.onKeyDown(keyEvent("ArrowUp")));

    expect(result.current.size).toBe(256);
  });

  it("no painel ancorado à direita, o sinal do arraste e das setas se inverte", async () => {
    const repo = makeRepo();
    const handle = makeHandle();
    const { result } = renderHook(
      () => useResizablePanel({ ...OPTIONS, key: "retroactiveFormWidth", anchor: "right" }),
      { wrapper: wrapperWith(repo) }
    );
    await waitFor(() => expect(result.current.size).toBe(256));

    act(() => result.current.handleProps.onPointerDown(pointerEvent(handle, 300)));
    act(() => result.current.handleProps.onPointerMove(pointerEvent(handle, 250)));

    expect(result.current.size).toBe(306);

    act(() => result.current.handleProps.onKeyDown(keyEvent("ArrowRight")));

    expect(result.current.size).toBe(290);
  });

  describe("eixo vertical (anchor top)", () => {
    const TOP = {
      key: "retroactivePlannedHeight",
      min: 72,
      max: 480,
      defaultSize: 144,
      anchor: "top",
    } as const;

    it("declara o separador como horizontal", async () => {
      const repo = makeRepo();
      const { result } = renderHook(() => useResizablePanel(TOP), {
        wrapper: wrapperWith(repo),
      });
      await waitFor(() => expect(result.current.size).toBe(144));

      expect(result.current.handleProps["aria-orientation"]).toBe("horizontal");
    });

    it("arrastar para baixo cresce, e persiste ao soltar", async () => {
      const repo = makeRepo();
      const handle = makeHandle();
      const { result } = renderHook(() => useResizablePanel(TOP), {
        wrapper: wrapperWith(repo),
      });
      await waitFor(() => expect(result.current.size).toBe(144));

      act(() => result.current.handleProps.onPointerDown(pointerEvent(handle, 200)));
      act(() => result.current.handleProps.onPointerMove(pointerEvent(handle, 260)));

      expect(result.current.size).toBe(204);

      act(() => result.current.handleProps.onPointerUp(pointerEvent(handle, 260)));

      expect(repo.set).toHaveBeenCalledWith("retroactivePlannedHeight", 204);
    });

    it("responde às setas do próprio eixo e ignora as do outro", async () => {
      const repo = makeRepo();
      const { result } = renderHook(() => useResizablePanel(TOP), {
        wrapper: wrapperWith(repo),
      });
      await waitFor(() => expect(result.current.size).toBe(144));

      act(() => result.current.handleProps.onKeyDown(keyEvent("ArrowDown")));
      expect(result.current.size).toBe(160);

      act(() => result.current.handleProps.onKeyDown(keyEvent("ArrowUp")));
      expect(result.current.size).toBe(144);

      // Consumir a seta do eixo alheio roubaria a tecla de quem navega a tela.
      const sideways = keyEvent("ArrowRight");
      act(() => result.current.handleProps.onKeyDown(sideways));
      expect(result.current.size).toBe(144);
      expect(sideways.preventDefault).not.toHaveBeenCalled();
    });

    it("o teto do arraste acompanha o conteúdo medido", async () => {
      const repo = makeRepo();
      const handle = makeHandle();
      // 200px de conteúdo: o arraste para no conteúdo, não no máximo duro.
      const { result } = renderHook(() => useResizablePanel({ ...TOP, max: 200 }), {
        wrapper: wrapperWith(repo),
      });
      await waitFor(() => expect(result.current.size).toBe(144));

      act(() => result.current.handleProps.onPointerDown(pointerEvent(handle, 200)));
      act(() => result.current.handleProps.onPointerMove(pointerEvent(handle, 900)));

      expect(result.current.size).toBe(200);
    });
  });

  it("reset devolve o padrão e persiste", async () => {
    const repo = makeRepo({ loadAll: vi.fn(() => Promise.resolve({ planningFormWidth: 480 })) });
    const { result } = renderHook(() => useResizablePanel(OPTIONS), {
      wrapper: wrapperWith(repo),
    });
    await waitFor(() => expect(result.current.size).toBe(480));

    act(() => result.current.reset());

    expect(result.current.size).toBe(256);
    expect(repo.set).toHaveBeenCalledWith("planningFormWidth", 256);
  });

  it("expõe a semântica de separador com os limites do arraste", async () => {
    const repo = makeRepo({ loadAll: vi.fn(() => Promise.resolve({ planningFormWidth: 300 })) });
    const { result } = renderHook(() => useResizablePanel(OPTIONS), {
      wrapper: wrapperWith(repo),
    });
    await waitFor(() => expect(result.current.size).toBe(300));

    expect(result.current.handleProps.role).toBe("separator");
    expect(result.current.handleProps["aria-orientation"]).toBe("vertical");
    expect(result.current.handleProps["aria-valuenow"]).toBe(300);
    expect(result.current.handleProps["aria-valuemin"]).toBe(224);
    expect(result.current.handleProps["aria-valuemax"]).toBe(560);
  });
});
