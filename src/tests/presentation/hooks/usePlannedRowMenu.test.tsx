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
  return { preventDefault: vi.fn(), clientX: x, clientY: y } as unknown as MouseEvent;
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

  // O resto do comportamento (abrir, alternar, fechar) é do `useRowMenu` e é testado lá.
  it("repassa o modo de seleção: o menu aberto fecha ao entrar nele", () => {
    const { result, rerender } = setup();
    act(() => result.current.openAtPointer(pointer(1, 2)));

    rerender({ disabled: true });
    expect(result.current.anchor).toBeNull();
    rerender({ disabled: false });
    expect(result.current.anchor).toBeNull();
  });
});
