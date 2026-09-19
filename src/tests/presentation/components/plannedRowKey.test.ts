import { describe, expect, it } from "vitest";
import { PLANNED_ROW_KEYS } from "@presentation/components/plannedRowKey";
import { rowKey } from "@presentation/components/rowKey";

type Mods = Partial<Record<"ctrlKey" | "metaKey" | "altKey" | "repeat", boolean>>;

function key(k: string, mods: Mods = {}) {
  return { key: k, ctrlKey: false, metaKey: false, altKey: false, repeat: false, ...mods };
}

describe("PLANNED_ROW_KEYS", () => {
  it.each([
    ["Enter", "play"],
    [" ", "toggleComplete"],
    ["e", "edit"],
    ["E", "edit"],
    ["d", "duplicate"],
    ["D", "duplicate"],
    ["l", "copyLink"],
    ["L", "copyLink"],
    ["Delete", "delete"],
    ["ArrowDown", "focusNext"],
    ["ArrowUp", "focusPrev"],
  ])("%j vira %s", (k, action) => {
    expect(rowKey(key(k), PLANNED_ROW_KEYS)).toBe(action);
  });

  // Modificadores e setas são regras do `rowKey`, testadas lá; aqui
  // fica o que é do mapa da planejada.
  it.each(["Escape", "Tab", "x", "Backspace", "ArrowLeft", "Del"])("%j não é ação", (k) => {
    expect(rowKey(key(k), PLANNED_ROW_KEYS)).toBeNull();
  });

  it.each(["Enter", " ", "e", "d", "l", "Delete"])(
    "%j segurado não repete a ação — duplicata, alternância ou Play em série",
    (k) => {
      expect(rowKey(key(k, { repeat: true }), PLANNED_ROW_KEYS)).toBeNull();
    }
  );
});
