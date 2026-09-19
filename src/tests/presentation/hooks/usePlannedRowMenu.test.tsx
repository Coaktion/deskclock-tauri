import type { MouseEvent } from "react";
import { describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import type { PlannedTaskAction } from "@domain/entities/PlannedTask";
import { MENU_DIVIDER, type MenuItem } from "@presentation/components/ui";
import { usePlannedRowMenu } from "@presentation/hooks/usePlannedRowMenu";

function setup(disabled = false, taskActions: PlannedTaskAction[] = []) {
  const actions = {
    onEdit: vi.fn(),
    onDuplicate: vi.fn(),
    onCopyLink: vi.fn(),
    onDelete: vi.fn(),
  };
  const hook = renderHook(
    (props: { disabled: boolean }) =>
      usePlannedRowMenu({ ...actions, actions: taskActions, disabled: props.disabled }),
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

    itens.forEach((i) => i.onSelect?.());
    expect(actions.onEdit).toHaveBeenCalledTimes(1);
    expect(actions.onDuplicate).toHaveBeenCalledTimes(1);
    expect(actions.onCopyLink).toHaveBeenCalledTimes(1);
    expect(actions.onDelete).toHaveBeenCalledTimes(1);
  });

  it("sem ações na tarefa, o menu é só o de sempre", () => {
    expect(setup().result.current.items).toHaveLength(5);
  });

  it("com ações, elas entram no fim, depois de um divisor (H1)", () => {
    const { result } = setup(false, [
      { type: "open_url", value: "https://meet.google.com/abc" },
      { type: "open_file", value: "/home/eduardo/ata.md" },
    ]);
    const { items } = result.current;
    expect(items[5]).toBe(MENU_DIVIDER);
    const acoes = items[6] as MenuItem;
    expect(acoes.label).toBe("Ações");
    expect(acoes.children?.map((c) => c.label)).toEqual(["Meet", "ata.md"]);
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
