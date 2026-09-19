import type { MouseEvent } from "react";
import { describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { MENU_DIVIDER, type MenuItem } from "@presentation/components/ui";
import { usePlannedRowMenu } from "@presentation/hooks/usePlannedRowMenu";

function setup(disabled = false) {
  const actions = {
    onEdit: vi.fn(),
    onDuplicate: vi.fn(),
    onCopyLink: vi.fn(),
    onDelete: vi.fn(),
  };
  const hook = renderHook(
    (props: { disabled: boolean }) => usePlannedRowMenu({ ...actions, disabled: props.disabled }),
    { initialProps: { disabled } }
  );
  return { ...hook, actions };
}

function pointer(x: number, y: number) {
  return { preventDefault: vi.fn(), clientX: x, clientY: y } as unknown as MouseEvent & {
    preventDefault: ReturnType<typeof vi.fn>;
  };
}

describe("usePlannedRowMenu", () => {
  it("itens na ordem, com os rótulos e os atalhos da linha, e Excluir em danger", () => {
    const { result, actions } = setup();
    const { items } = result.current;

    expect(items[3]).toBe(MENU_DIVIDER);
    const itens = items.filter((i): i is MenuItem => i !== MENU_DIVIDER);
    expect(itens.map((i) => [i.label, i.shortcut])).toEqual([
      ["Editar", "E"],
      ["Duplicar", "D"],
      ["Copiar link", "L"],
      ["Excluir", "Del"],
    ]);
    expect(itens[3].tone).toBe("danger");
    expect(itens.slice(0, 3).every((i) => i.tone === undefined)).toBe(true);

    itens.forEach((i) => i.onSelect());
    expect(actions.onEdit).toHaveBeenCalledTimes(1);
    expect(actions.onDuplicate).toHaveBeenCalledTimes(1);
    expect(actions.onCopyLink).toHaveBeenCalledTimes(1);
    expect(actions.onDelete).toHaveBeenCalledTimes(1);
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
