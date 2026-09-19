import { describe, expect, it } from "vitest";
import { plannedRowKey } from "@presentation/components/plannedRowKey";

type Mods = Partial<Record<"ctrlKey" | "metaKey" | "altKey" | "repeat", boolean>>;

function key(k: string, mods: Mods = {}) {
  return { key: k, ctrlKey: false, metaKey: false, altKey: false, repeat: false, ...mods };
}

describe("plannedRowKey", () => {
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
    expect(plannedRowKey(key(k))).toBe(action);
  });

  it.each(["ctrlKey", "metaKey", "altKey"] as const)(
    "com %s não age — não rouba Ctrl+Z, Ctrl+C nem atalho do sistema",
    (mod) => {
      expect(plannedRowKey(key("z", { [mod]: true }))).toBeNull();
      expect(plannedRowKey(key("e", { [mod]: true }))).toBeNull();
      expect(plannedRowKey(key("Enter", { [mod]: true }))).toBeNull();
    }
  );

  it.each(["Escape", "Tab", "x", "Backspace", "ArrowLeft", "Del"])("%j não é ação", (k) => {
    expect(plannedRowKey(key(k))).toBeNull();
  });

  it.each(["Enter", " ", "e", "d", "l", "Delete"])(
    "%j segurado não repete a ação — duplicata, alternância ou Play em série",
    (k) => {
      expect(plannedRowKey(key(k, { repeat: true }))).toBeNull();
    }
  );

  it("as setas seguradas continuam andando pela lista", () => {
    expect(plannedRowKey(key("ArrowDown", { repeat: true }))).toBe("focusNext");
    expect(plannedRowKey(key("ArrowUp", { repeat: true }))).toBe("focusPrev");
  });
});
