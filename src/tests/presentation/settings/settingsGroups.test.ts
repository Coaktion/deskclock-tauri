import { describe, expect, it } from "vitest";
import { buildSettingsPort } from "@presentation/settings/settingsGroups";
import { makeSettingsDoubles } from "./fakeSettings";

describe("buildSettingsPort", () => {
  it("lê o Geral com o autostart do sistema e a semana por nome", async () => {
    const { config, system } = makeSettingsDoubles({ weekStartsOn: 0 });
    const port = buildSettingsPort(config, system);
    const general = await port.general();
    expect(general.startOnBoot).toBe(true);
    expect(general.weekStartsOn).toBe("sunday");
    expect(general.dailyGoalHours).toBe(8);
  });

  it("sem o plugin de autostart, cai na chave gravada", async () => {
    const { config, system } = makeSettingsDoubles({ startOnBoot: true });
    system.autostart.isEnabled.mockRejectedValue(new Error("sem plugin"));
    expect((await buildSettingsPort(config, system).general()).startOnBoot).toBe(true);
  });

  it("o update do Geral grava só o que veio, com os efeitos da aba", async () => {
    const { config, system, values } = makeSettingsDoubles();
    const port = buildSettingsPort(config, system);
    const result = await port.updateGeneral({
      roundingSlots: [45, 15],
      startOnBoot: true,
      weekStartsOn: "sunday",
      dailyGoalHours: 6,
    });
    expect(values.roundingSlots).toEqual([15, 45]);
    expect(values.weekStartsOn).toBe(0);
    expect(values.dailyGoalHours).toBe(6);
    expect(system.autostart.enable).toHaveBeenCalledOnce();
    expect(system.emitConfigChanged).toHaveBeenCalledWith("weekStartsOn", 0);
    expect(system.emitConfigChanged).not.toHaveBeenCalledWith("showWeekend", expect.anything());
    expect(config.set).not.toHaveBeenCalledWith("userName", expect.anything());
    expect(result.weekStartsOn).toBe("sunday");
  });

  it("overlay e acessibilidade aplicam os efeitos e devolvem o estado novo", async () => {
    const { config, system } = makeSettingsDoubles();
    const port = buildSettingsPort(config, system);
    expect(await port.updateOverlay({ opacity: 50, snapToGrid: true })).toEqual({
      opacity: 50,
      snapToGrid: true,
    });
    expect(await port.updateAccessibility({ mode: "claro", accent: "roxo" })).toEqual({
      mode: "claro",
      accent: "roxo",
    });
    expect(system.applyAppearance).toHaveBeenLastCalledWith({ mode: "claro", accent: "roxo" });
    expect(system.emitConfigChanged).toHaveBeenCalledWith("overlaySnapToGrid", true);
  });

  it("os atalhos voltam com os recusados e o display server", async () => {
    const { config, system } = makeSettingsDoubles();
    system.registerShortcuts.mockResolvedValue(["F5"]);
    system.displayServer.mockResolvedValue("wayland");
    const port = buildSettingsPort(config, system);
    expect(
      await port.updateShortcuts({
        toggleTask: "F5",
        stopTask: "",
        toggleOverlay: "",
        toggleWindow: "",
      })
    ).toEqual({ failed: ["F5"], displayServer: "wayland" });
    expect(port.shortcuts().toggleTask).toBe("F5");
    expect(await port.toggleOverlay()).toBe(true);
  });
});
