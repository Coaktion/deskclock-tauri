import { describe, expect, it } from "vitest";
import {
  currentAppearance,
  resetWindowPositions,
  saveAppearance,
  saveOverlayOpacity,
  saveShortcuts,
  saveShowWeekend,
  saveStartOnBoot,
  saveWeekStartsOn,
} from "@presentation/settings/settingsEffects";
import { makeSettingsDoubles } from "./fakeSettings";

describe("settingsEffects", () => {
  it("iniciar com o SO grava e liga ou desliga o autostart", async () => {
    const { config, system, order } = makeSettingsDoubles();
    await saveStartOnBoot(config, system, true);
    await saveStartOnBoot(config, system, false);
    expect(order).toEqual([
      "set:startOnBoot",
      "autostart:enable",
      "set:startOnBoot",
      "autostart:disable",
    ]);
  });

  it("início da semana, fim de semana e opacidade gravam e avisam as outras janelas", async () => {
    const { config, system, order } = makeSettingsDoubles();
    await saveWeekStartsOn(config, system, 0);
    await saveShowWeekend(config, system, true);
    await saveOverlayOpacity(config, system, 60);
    expect(order).toEqual([
      "set:weekStartsOn",
      "emit:weekStartsOn",
      "set:showWeekend",
      "emit:showWeekend",
      "set:overlayOpacity",
      "emit:overlayOpacity",
    ]);
    expect(system.emitConfigChanged).toHaveBeenCalledWith("weekStartsOn", 0);
  });

  it("a aparência repinta, grava o eixo e avisa; o outro eixo vem do tema legado", async () => {
    const { config, system, values } = makeSettingsDoubles({ theme: "verde" });
    const current = currentAppearance(config);
    expect(current).toEqual({ mode: "escuro", accent: "verde" });
    const next = await saveAppearance(config, system, current, "mode", "claro");
    expect(next).toEqual({ mode: "claro", accent: "verde" });
    expect(system.applyAppearance).toHaveBeenCalledWith(next);
    expect(values.mode).toBe("claro");
    expect(values.accent).toBe("");
    expect(system.emitConfigChanged).toHaveBeenCalledWith("mode", "claro");
  });

  it("atalhos registram os quatro e gravam os quatro, inclusive o recusado", async () => {
    const { config, system, values } = makeSettingsDoubles();
    system.registerShortcuts.mockResolvedValue(["Alt+O"]);
    const failed = await saveShortcuts(config, system, {
      toggleTask: "CmdOrCtrl+P",
      stopTask: "",
      toggleOverlay: "Alt+O",
      toggleWindow: "",
    });
    expect(failed).toEqual(["Alt+O"]);
    expect(system.registerShortcuts).toHaveBeenCalledWith([
      { action: "toggle-task", accelerator: "CmdOrCtrl+P" },
      { action: "stop-task", accelerator: "" },
      { action: "toggle-overlay", accelerator: "Alt+O" },
      { action: "toggle-window", accelerator: "" },
    ]);
    expect(values.shortcutToggleOverlay).toBe("Alt+O");
    expect(values.shortcutToggleTask).toBe("CmdOrCtrl+P");
  });

  it("redefinir posições volta as quatro janelas à posição nunca salva", async () => {
    const { config, values } = makeSettingsDoubles();
    await resetWindowPositions(config);
    for (const key of [
      "mainWindowPosition",
      "overlayPosition_execution",
      "overlayPosition_planning",
      "overlayPosition_compact",
    ] as const) {
      expect(values[key]).toEqual({ x: -1, y: -1 });
    }
  });
});
