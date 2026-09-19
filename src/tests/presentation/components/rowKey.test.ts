import type { KeyboardEvent } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { rowKey, rowKeyDownHandler, type RowKeyMap } from "@presentation/components/rowKey";

type Mods = Partial<Record<"ctrlKey" | "metaKey" | "altKey" | "repeat", boolean>>;

function key(k: string, mods: Mods = {}) {
  return { key: k, ctrlKey: false, metaKey: false, altKey: false, repeat: false, ...mods };
}

// Um mapa de lançamento (G4/G5): só Editar e Excluir, sem Play nem conclusão.
const ENTRY_KEYS: RowKeyMap<"edit" | "delete"> = { e: "edit", Delete: "delete" };

describe("rowKey", () => {
  it.each([
    ["e", "edit"],
    ["E", "edit"],
    ["Delete", "delete"],
    ["ArrowDown", "focusNext"],
    ["ArrowUp", "focusPrev"],
  ])("%j vira %s pelo mapa da tela", (k, action) => {
    expect(rowKey(key(k), ENTRY_KEYS)).toBe(action);
  });

  it.each(["Enter", " ", "d", "l", "Escape", "Tab", "ArrowLeft", "Del"])(
    "%j fora do mapa não é ação — letra só onde o item existe",
    (k) => {
      expect(rowKey(key(k), ENTRY_KEYS)).toBeNull();
    }
  );

  it("as setas valem mesmo com o mapa vazio", () => {
    expect(rowKey(key("ArrowDown"), {})).toBe("focusNext");
  });

  it("nome de propriedade do protótipo não vira ação", () => {
    expect(rowKey(key("constructor"), ENTRY_KEYS)).toBeNull();
  });

  it.each(["ctrlKey", "metaKey", "altKey"] as const)(
    "com %s não age — não rouba Ctrl+Z, Ctrl+C nem atalho do sistema",
    (mod) => {
      expect(rowKey(key("z", { [mod]: true }), ENTRY_KEYS)).toBeNull();
      expect(rowKey(key("e", { [mod]: true }), ENTRY_KEYS)).toBeNull();
      expect(rowKey(key("ArrowDown", { [mod]: true }), ENTRY_KEYS)).toBeNull();
    }
  );

  it.each(["e", "Delete"])("%j segurado não repete a ação", (k) => {
    expect(rowKey(key(k, { repeat: true }), ENTRY_KEYS)).toBeNull();
  });

  it("as setas seguradas continuam andando pela lista", () => {
    expect(rowKey(key("ArrowDown", { repeat: true }), ENTRY_KEYS)).toBe("focusNext");
    expect(rowKey(key("ArrowUp", { repeat: true }), ENTRY_KEYS)).toBe("focusPrev");
  });
});

describe("rowKeyDownHandler", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });

  /** Três linhas focáveis e, entre elas, um irmão que não é linha. */
  function list() {
    const parent = document.createElement("div");
    const rows = [0, 1, 2].map(() => {
      const row = document.createElement("div");
      row.tabIndex = 0;
      return row;
    });
    parent.append(rows[0], document.createElement("span"), rows[1], rows[2]);
    document.body.append(parent);
    return rows;
  }

  function press(target: HTMLElement, k: string, currentTarget = target) {
    const e = { ...key(k), target, currentTarget, preventDefault: vi.fn() };
    return e as unknown as KeyboardEvent<HTMLElement> & {
      preventDefault: ReturnType<typeof vi.fn>;
    };
  }

  function setup() {
    const handlers = { edit: vi.fn(), delete: vi.fn() };
    return { handlers, onKeyDown: rowKeyDownHandler(ENTRY_KEYS, handlers) };
  }

  it("chama o handler da ação e consome a tecla", () => {
    const { handlers, onKeyDown } = setup();
    const [row] = list();
    const e = press(row, "E");

    onKeyDown(e);
    expect(handlers.edit).toHaveBeenCalledTimes(1);
    expect(e.preventDefault).toHaveBeenCalledTimes(1);
  });

  it("tecla fora do mapa segue seu caminho, sem preventDefault", () => {
    const { handlers, onKeyDown } = setup();
    const [row] = list();
    const e = press(row, " ");

    onKeyDown(e);
    expect(e.preventDefault).not.toHaveBeenCalled();
    expect(handlers.edit).not.toHaveBeenCalled();
    expect(handlers.delete).not.toHaveBeenCalled();
  });

  it("tecla vinda de um controle dentro da linha é ignorada", () => {
    const { handlers, onKeyDown } = setup();
    const [row] = list();
    const button = document.createElement("button");
    row.append(button);
    const e = press(button, "Delete", row);

    onKeyDown(e);
    expect(handlers.delete).not.toHaveBeenCalled();
    expect(e.preventDefault).not.toHaveBeenCalled();
  });

  it("as setas focam a linha vizinha, pulando o irmão que não é linha, e param nas pontas", () => {
    const { onKeyDown } = setup();
    const rows = list();
    rows[0].focus();

    onKeyDown(press(rows[0], "ArrowDown"));
    expect(document.activeElement).toBe(rows[1]);
    onKeyDown(press(rows[1], "ArrowUp"));
    expect(document.activeElement).toBe(rows[0]);

    onKeyDown(press(rows[0], "ArrowUp"));
    expect(document.activeElement).toBe(rows[0]);
    rows[2].focus();
    onKeyDown(press(rows[2], "ArrowDown"));
    expect(document.activeElement).toBe(rows[2]);
  });
});
