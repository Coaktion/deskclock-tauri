import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";

import {
  Menu,
  MENU_DIVIDER,
  placeMenu,
  type MenuAnchor,
  type MenuEntry,
} from "@presentation/components/ui/Menu";

afterEach(cleanup);

function makeItems(overrides: { disabledDuplicar?: boolean } = {}) {
  const calls = {
    editar: vi.fn(),
    duplicar: vi.fn(),
    copiar: vi.fn(),
    excluir: vi.fn(),
  };
  const items: MenuEntry[] = [
    {
      label: "Editar",
      shortcut: "E",
      icon: <svg data-testid="icone-editar" />,
      onSelect: calls.editar,
    },
    {
      label: "Duplicar",
      shortcut: "D",
      disabled: overrides.disabledDuplicar,
      onSelect: calls.duplicar,
    },
    { label: "Copiar link", shortcut: "L", onSelect: calls.copiar },
    MENU_DIVIDER,
    { label: "Excluir", shortcut: "Del", tone: "danger", onSelect: calls.excluir },
  ];
  return { items, calls };
}

/**
 * O menu como a F5 vai usá-lo: estado do chamador é o `anchor`, o ⋯ alterna, o
 * clique direito abre no ponto, e tudo mora sobre uma linha que escuta clique.
 */
function Harness({
  items,
  initial = null,
  onRowClick = () => {},
}: {
  items: MenuEntry[];
  initial?: MenuAnchor | null;
  onRowClick?: () => void;
}) {
  const [anchor, setAnchor] = useState<MenuAnchor | null>(initial);
  return (
    <div
      data-testid="linha"
      onClick={onRowClick}
      onContextMenu={(e) => {
        e.preventDefault();
        setAnchor({ x: e.clientX, y: e.clientY });
      }}
    >
      <button type="button" onClick={(e) => setAnchor((a) => (a ? null : e.currentTarget))}>
        Mais
      </button>
      <Menu anchor={anchor} items={items} onClose={() => setAnchor(null)} label="Ações da tarefa" />
    </div>
  );
}

function openByTrigger(items: MenuEntry[], onRowClick?: () => void) {
  render(<Harness items={items} onRowClick={onRowClick} />);
  const trigger = screen.getByRole("button", { name: "Mais" });
  trigger.focus();
  fireEvent.click(trigger);
  return { trigger, menu: screen.getByRole("menu", { name: "Ações da tarefa" }) };
}

const focused = () => document.activeElement?.textContent;

describe("Menu — renderização", () => {
  it("fechado (`anchor` nulo) não desenha nada", () => {
    render(<Harness items={makeItems().items} />);
    expect(screen.queryByRole("menu")).toBeNull();
  });

  it("desenha itens, divisor, atalho e ícone, em portal", () => {
    const { menu } = openByTrigger(makeItems().items);
    expect(menu.parentElement).toBe(document.body);
    expect(screen.getAllByRole("menuitem")).toHaveLength(4);
    expect(screen.getAllByRole("separator")).toHaveLength(1);
    expect(screen.getByRole("menuitem", { name: /Excluir/ }).textContent).toContain("Del");
    expect(screen.getByTestId("icone-editar")).toBeTruthy();
  });

  it("o item `danger` leva o tom de perigo", () => {
    openByTrigger(makeItems().items);
    expect(screen.getByRole("menuitem", { name: /Excluir/ }).className).toContain("text-danger");
    expect(screen.getByRole("menuitem", { name: /Editar/ }).className).not.toContain("text-danger");
  });
});

describe("Menu — âncora", () => {
  it("ancorado num ponto, abre no ponto", () => {
    render(<Harness items={makeItems().items} />);
    fireEvent.contextMenu(screen.getByTestId("linha"), { clientX: 120, clientY: 80 });
    const menu = screen.getByRole("menu");
    expect(menu.style.left).toBe("120px");
    expect(menu.style.top).toBe("80px");
  });

  it("ancorado num elemento, abre abaixo dele com as bordas direitas alinhadas", () => {
    render(<Harness items={makeItems().items} />);
    const trigger = screen.getByRole("button", { name: "Mais" });
    trigger.getBoundingClientRect = () =>
      ({ top: 40, bottom: 60, left: 300, right: 320, width: 20, height: 20 }) as DOMRect;
    fireEvent.click(trigger);
    const menu = screen.getByRole("menu");
    // jsdom mede o painel como 0×0, então a borda direita do menu é o `left`.
    expect(menu.style.left).toBe("320px");
    expect(menu.style.top).toBe("64px");
  });
});

describe("placeMenu", () => {
  const size = { width: 200, height: 150 };
  const viewport = { width: 800, height: 600 };

  it("do ponto, cresce para a direita e para baixo quando cabe", () => {
    expect(placeMenu({ point: { x: 100, y: 100 } }, size, viewport)).toEqual({
      left: 100,
      top: 100,
    });
  });

  it("do ponto, vira para a esquerda e para cima perto da borda", () => {
    expect(placeMenu({ point: { x: 700, y: 550 } }, size, viewport)).toEqual({
      left: 500,
      top: 400,
    });
  });

  it("do elemento, alinha à direita e sobe quando falta espaço embaixo", () => {
    const rect = { top: 500, bottom: 520, left: 380, right: 400 };
    expect(placeMenu({ rect }, size, viewport)).toEqual({ left: 200, top: 346 });
  });

  it("do elemento colado à esquerda, cresce para a direita", () => {
    const rect = { top: 10, bottom: 30, left: 10, right: 30 };
    expect(placeMenu({ rect }, size, viewport)).toEqual({ left: 10, top: 34 });
  });

  it("nunca sai da janela, mesmo menor que o menu", () => {
    const pos = placeMenu({ point: { x: 50, y: 50 } }, size, { width: 150, height: 100 });
    expect(pos).toEqual({ left: 4, top: 4 });
  });
});

describe("Menu — teclado", () => {
  it("abre com o foco no primeiro item habilitado", () => {
    openByTrigger(makeItems().items);
    expect(focused()).toContain("Editar");
  });

  it("↓ e ↑ navegam com volta, pulando o desabilitado", () => {
    const { menu } = openByTrigger(makeItems({ disabledDuplicar: true }).items);
    fireEvent.keyDown(menu, { key: "ArrowDown" });
    expect(focused()).toContain("Copiar link");
    fireEvent.keyDown(menu, { key: "ArrowDown" });
    expect(focused()).toContain("Excluir");
    fireEvent.keyDown(menu, { key: "ArrowDown" });
    expect(focused()).toContain("Editar");
    fireEvent.keyDown(menu, { key: "ArrowUp" });
    expect(focused()).toContain("Excluir");
  });

  it("Home e End vão às pontas", () => {
    const { menu } = openByTrigger(makeItems().items);
    fireEvent.keyDown(menu, { key: "End" });
    expect(focused()).toContain("Excluir");
    fireEvent.keyDown(menu, { key: "Home" });
    expect(focused()).toContain("Editar");
  });

  it("Enter escolhe o item focado, fecha e é consumido", () => {
    const { items, calls } = makeItems();
    const { menu } = openByTrigger(items);
    fireEvent.keyDown(menu, { key: "ArrowDown" });
    const notPrevented = fireEvent.keyDown(document.activeElement!, { key: "Enter" });
    expect(notPrevented).toBe(false);
    expect(calls.duplicar).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("menu")).toBeNull();
  });

  it("Espaço escolhe o item focado e fecha", () => {
    const { items, calls } = makeItems();
    openByTrigger(items);
    fireEvent.keyDown(document.activeElement!, { key: " " });
    expect(calls.editar).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("menu")).toBeNull();
  });

  it("a tecla do atalho escolhe, sem diferenciar caixa, e `Del` é a tecla Delete", () => {
    const { items, calls } = makeItems();
    const { menu } = openByTrigger(items);
    fireEvent.keyDown(menu, { key: "l" });
    expect(calls.copiar).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("menu")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Mais" }));
    fireEvent.keyDown(screen.getByRole("menu"), { key: "Delete" });
    expect(calls.excluir).toHaveBeenCalledTimes(1);
  });

  it("atalho com Ctrl não escolhe — é de outro dono", () => {
    const { items, calls } = makeItems();
    const { menu } = openByTrigger(items);
    fireEvent.keyDown(menu, { key: "e", ctrlKey: true });
    expect(calls.editar).not.toHaveBeenCalled();
  });

  it("o item desabilitado não escolhe nem por atalho nem por clique", () => {
    const { items, calls } = makeItems({ disabledDuplicar: true });
    const { menu } = openByTrigger(items);
    fireEvent.keyDown(menu, { key: "d" });
    fireEvent.click(screen.getByRole("menuitem", { name: /Duplicar/ }));
    expect(calls.duplicar).not.toHaveBeenCalled();
    expect(screen.getByRole("menu")).toBeTruthy();
  });

  it("ESC fecha, é consumido e não chega ao documento — onde esconderia a janela", () => {
    const onDocument = vi.fn();
    const onWindow = vi.fn();
    document.addEventListener("keydown", onDocument);
    window.addEventListener("keydown", onWindow);
    try {
      const { menu } = openByTrigger(makeItems().items);
      expect(menu.hasAttribute("data-modal-open")).toBe(true);
      const notPrevented = fireEvent.keyDown(document.activeElement!, { key: "Escape" });
      expect(notPrevented).toBe(false);
      expect(onDocument).not.toHaveBeenCalled();
      expect(onWindow).not.toHaveBeenCalled();
      expect(screen.queryByRole("menu")).toBeNull();
    } finally {
      document.removeEventListener("keydown", onDocument);
      window.removeEventListener("keydown", onWindow);
    }
  });
});

describe("Menu — fechar e foco", () => {
  it("o foco volta ao gatilho ao fechar pelo ESC", () => {
    const { trigger } = openByTrigger(makeItems().items);
    expect(document.activeElement).not.toBe(trigger);
    fireEvent.keyDown(document.activeElement!, { key: "Escape" });
    expect(document.activeElement).toBe(trigger);
  });

  it("o foco volta ao gatilho ao escolher, antes de a ação rodar", () => {
    const { items } = makeItems();
    let focusAtSelect: Element | null = null;
    (items[0] as { onSelect: () => void }).onSelect = () => {
      focusAtSelect = document.activeElement;
    };
    const { trigger } = openByTrigger(items);
    fireEvent.click(screen.getByRole("menuitem", { name: /Editar/ }));
    expect(focusAtSelect).toBe(trigger);
  });

  it("clique fora fecha", () => {
    openByTrigger(makeItems().items);
    fireEvent.mouseDown(document.body);
    expect(screen.queryByRole("menu")).toBeNull();
  });

  it("o gatilho alterna: clicá-lo com o menu aberto fecha", () => {
    const { trigger } = openByTrigger(makeItems().items);
    fireEvent.mouseDown(trigger);
    expect(screen.getByRole("menu")).toBeTruthy();
    fireEvent.click(trigger);
    expect(screen.queryByRole("menu")).toBeNull();
  });

  it("rolagem e blur da janela fecham", () => {
    openByTrigger(makeItems().items);
    act(() => {
      window.dispatchEvent(new Event("scroll"));
    });
    expect(screen.queryByRole("menu")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Mais" }));
    act(() => {
      window.dispatchEvent(new Event("blur"));
    });
    expect(screen.queryByRole("menu")).toBeNull();
  });

  it("clique dentro do menu não chega à linha por baixo", () => {
    const onRowClick = vi.fn();
    openByTrigger(makeItems().items, onRowClick);
    onRowClick.mockClear();
    fireEvent.mouseDown(screen.getByRole("menuitem", { name: /Editar/ }));
    fireEvent.click(screen.getByRole("menuitem", { name: /Editar/ }));
    expect(onRowClick).not.toHaveBeenCalled();
  });

  it("Tab fecha, é consumido e devolve o foco ao gatilho", () => {
    const { trigger } = openByTrigger(makeItems().items);
    const notPrevented = fireEvent.keyDown(document.activeElement!, { key: "Tab" });
    expect(notPrevented).toBe(false);
    expect(screen.queryByRole("menu")).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });

  it("clique direito dentro do menu não chega à linha nem reancora", () => {
    render(<Harness items={makeItems().items} />);
    fireEvent.contextMenu(screen.getByTestId("linha"), { clientX: 120, clientY: 80 });
    const item = screen.getByRole("menuitem", { name: /Editar/ });
    const notPrevented = fireEvent.contextMenu(item, { clientX: 300, clientY: 300 });
    expect(notPrevented).toBe(false);
    const menu = screen.getByRole("menu");
    expect(menu.style.left).toBe("120px");
    expect(menu.style.top).toBe("80px");
  });

  it("redimensionar a janela fecha", () => {
    openByTrigger(makeItems().items);
    act(() => {
      window.dispatchEvent(new Event("resize"));
    });
    expect(screen.queryByRole("menu")).toBeNull();
  });

  it("fechado ou desmontado, os listeners saem: `mousedown` e `scroll` não chamam `onClose`", () => {
    const onClose = vi.fn();
    const { rerender, unmount } = render(
      <Menu anchor={{ x: 10, y: 10 }} items={makeItems().items} onClose={onClose} />
    );
    rerender(<Menu anchor={null} items={makeItems().items} onClose={onClose} />);
    fireEvent.mouseDown(document.body);
    window.dispatchEvent(new Event("scroll"));
    expect(onClose).not.toHaveBeenCalled();

    rerender(<Menu anchor={{ x: 10, y: 10 }} items={makeItems().items} onClose={onClose} />);
    unmount();
    fireEvent.mouseDown(document.body);
    window.dispatchEvent(new Event("scroll"));
    expect(onClose).not.toHaveBeenCalled();
  });
});
