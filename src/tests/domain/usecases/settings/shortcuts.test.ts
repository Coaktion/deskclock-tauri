import { describe, expect, it } from "vitest";
import {
  WAYLAND_SHORTCUTS_WARNING,
  failedShortcutsWarning,
  shortcutConflictError,
  shortcutFormatError,
  shortcutRegistrations,
  shortcutsWarning,
} from "@domain/usecases/settings/shortcuts";

const values = {
  toggleTask: "CmdOrCtrl+Shift+P",
  stopTask: "",
  toggleOverlay: "Alt+O",
  toggleWindow: "F5",
};

describe("shortcuts", () => {
  it("monta o pedido do update_shortcuts com os quatro, na ordem da tela", () => {
    expect(shortcutRegistrations(values)).toEqual([
      { action: "toggle-task", accelerator: "CmdOrCtrl+Shift+P" },
      { action: "stop-task", accelerator: "" },
      { action: "toggle-overlay", accelerator: "Alt+O" },
      { action: "toggle-window", accelerator: "F5" },
    ]);
  });

  it("aceita o que o gravador da tela produz, e o vazio (remover)", () => {
    for (const ok of [
      "",
      "K",
      "CmdOrCtrl+1",
      "Shift+Alt+CmdOrCtrl+K",
      "CmdOrCtrl+Space",
      "Alt+/",
    ]) {
      expect(shortcutFormatError("Parar", ok), ok).toBeNull();
    }
  });

  it("recusa forma que o gravador não produz, nomeando a ação", () => {
    for (const bad of [
      "Ctrl+K",
      "CmdOrCtrl+",
      "Shift",
      "CmdOrCtrl+CmdOrCtrl+K",
      "Alt+Shift",
      "a b",
    ]) {
      expect(shortcutFormatError("Parar", bad), bad).toContain('Atalho inválido em "Parar"');
    }
  });

  it("acusa o mesmo atalho em duas ações, sem distinguir caixa, e ignora os vazios", () => {
    expect(shortcutConflictError(values)).toBeNull();
    expect(shortcutConflictError({ ...values, stopTask: "", toggleWindow: "" })).toBeNull();
    expect(shortcutConflictError({ ...values, toggleWindow: "alt+o" })).toBe(
      'O atalho "alt+o" já está em "Mostrar / Ocultar overlay" — escolha outro para "Mostrar / Ocultar janela".'
    );
  });

  it("escolhe o aviso como a tela: Wayland sempre, falha só fora dele", () => {
    expect(shortcutsWarning(0, "x11")).toBeNull();
    expect(shortcutsWarning(1, "x11")).toBe(failedShortcutsWarning(1));
    expect(shortcutsWarning(0, "wayland")).toBe(WAYLAND_SHORTCUTS_WARNING);
    expect(shortcutsWarning(2, "wayland")).toBe(WAYLAND_SHORTCUTS_WARNING);
    expect(failedShortcutsWarning(1)).toBe(
      "Um atalho não pôde ser registrado — pode estar em uso por outro aplicativo."
    );
    expect(failedShortcutsWarning(3)).toBe(
      "3 atalhos não puderam ser registrados — podem estar em uso por outro aplicativo."
    );
  });
});
