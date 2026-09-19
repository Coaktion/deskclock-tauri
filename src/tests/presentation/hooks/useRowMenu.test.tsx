import type { MouseEvent } from "react";
import { describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import type { MenuEntry } from "@presentation/components/ui";
import { useRowMenu } from "@presentation/hooks/useRowMenu";

// Os itens de um lançamento (G4/G5): outra tela, outro conjunto.
const items: MenuEntry[] = [
  { label: "Editar", shortcut: "E", onSelect: vi.fn() },
  { label: "Excluir", shortcut: "Del", tone: "danger", onSelect: vi.fn() },
];

function setup(disabled = false) {
  return renderHook((props: { disabled: boolean }) => useRowMenu({ items, ...props }), {
    initialProps: { disabled },
  });
}

function pointer(x: number, y: number) {
  return { preventDefault: vi.fn(), clientX: x, clientY: y } as unknown as MouseEvent & {
    preventDefault: ReturnType<typeof vi.fn>;
  };
}

describe("useRowMenu", () => {
  it("devolve os itens que a tela passou", () => {
    const { result } = setup();
    expect(result.current.items).toBe(items);
  });

  it("nasce fechado", () => {
    const { result } = setup();
    expect(result.current.anchor).toBeNull();
    expect(result.current.fromTrigger).toBe(false);
  });

  it("toggleFrom abre ancorado ao gatilho e, com o menu aberto, fecha", () => {
    const { result } = setup();
    const gatilho = document.createElement("span");

    act(() => result.current.toggleFrom(gatilho));
    expect(result.current.anchor).toBe(gatilho);
    expect(result.current.fromTrigger).toBe(true);

    act(() => result.current.toggleFrom(gatilho));
    expect(result.current.anchor).toBeNull();
  });

  it("openAtPointer segura o menu do sistema e ancora no ponto, sem se dizer do gatilho", () => {
    const { result } = setup();
    const evento = pointer(40, 60);

    act(() => result.current.openAtPointer(evento));
    expect(evento.preventDefault).toHaveBeenCalledTimes(1);
    expect(result.current.anchor).toEqual({ x: 40, y: 60 });
    expect(result.current.fromTrigger).toBe(false);
  });

  it("close fecha", () => {
    const { result } = setup();
    act(() => result.current.openAtPointer(pointer(1, 2)));
    act(() => result.current.close());
    expect(result.current.anchor).toBeNull();
  });

  it("ao entrar no modo de seleção o menu fecha, e não reaparece ao sair", () => {
    const { result, rerender } = setup();
    act(() => result.current.openAtPointer(pointer(1, 2)));

    rerender({ disabled: true });
    expect(result.current.anchor).toBeNull();
    rerender({ disabled: false });
    expect(result.current.anchor).toBeNull();
  });
});
