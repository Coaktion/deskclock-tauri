import { describe, expect, it } from "vitest";
import type { AppConfig } from "@shared/types/appConfig";
import { dispatchLocalApiRequest } from "@presentation/localApi/dispatch";
import { buildSettingsPort } from "@presentation/settings/settingsGroups";
import { WAYLAND_SHORTCUTS_WARNING } from "@domain/usecases/settings/shortcuts";
import { makeDeps } from "../fakeDeps";
import { makeSettingsDoubles } from "../../settings/fakeSettings";

/** A porta real, com a config e o sistema mockados na fronteira. */
function setup(initial: Partial<AppConfig> = {}) {
  const doubles = makeSettingsDoubles(initial);
  const deps = makeDeps();
  Object.assign(deps, { settings: buildSettingsPort(doubles.config, doubles.system) });
  const call = (op: string, body?: unknown) => dispatchLocalApiRequest(deps, op, { body });
  return { ...doubles, call };
}

describe("settings.* — Geral", () => {
  it("lê o grupo inteiro", async () => {
    const { call } = setup();
    const result = await call("settings.getGeneral");
    expect(result.status).toBe(200);
    expect(result.body).toMatchObject({
      userName: "Ana",
      startOnBoot: true,
      roundingSlots: [15, 30, 45, 60],
      weekStartsOn: "monday",
    });
  });

  it("grava parcial com os efeitos da aba e devolve o grupo", async () => {
    const { call, system, values } = setup();
    const result = await call("settings.updateGeneral", {
      showWeekend: true,
      startOnBoot: false,
      roundingTolerance: 5,
    });
    expect(result.status).toBe(200);
    expect(values.showWeekend).toBe(true);
    expect(values.roundingTolerance).toBe(5);
    expect(system.autostart.disable).toHaveBeenCalledOnce();
    expect(system.emitConfigChanged).toHaveBeenCalledWith("showWeekend", true);
  });

  it("corpo vazio não grava nada", async () => {
    const { call, config } = setup();
    expect((await call("settings.updateGeneral")).status).toBe(200);
    expect(config.set).not.toHaveBeenCalled();
  });

  it.each([
    [{ dailyGoalHours: 25 }, "dailyGoalHours deve ser um inteiro de 1 a 24 horas."],
    [{ weeklyGoalHours: 0 }, "weeklyGoalHours deve ser um inteiro de 1 a 168 horas."],
    [{ roundingTolerance: 3 }, "roundingTolerance deve ser um de: 0, 1, 2, 5, 10, 15."],
    [{ weekStartsOn: 1 }, "weekStartsOn deve ser um de: monday, sunday."],
    [{ startOnBoot: "sim" }, "startOnBoot deve ser true ou false."],
    [{ userName: null }, "userName não aceita null; omita para manter."],
  ])("recusa %j com 400 sem gravar", async (body, error) => {
    const { call, config } = setup();
    const result = await call("settings.updateGeneral", body);
    expect(result).toEqual({ status: 400, body: { error } });
    expect(config.set).not.toHaveBeenCalled();
  });

  it("recusa slot fora da tela", async () => {
    const { call } = setup();
    expect((await call("settings.updateGeneral", { roundingSlots: [15, 7] })).status).toBe(400);
  });

  it("chave órfã ou de outro grupo é 400, não ignorada", async () => {
    const { call, config } = setup();
    for (const key of ["fontSize", "overlayShowOnStart", "overlayOpacity", "llmApiKey"]) {
      const result = await call("settings.updateGeneral", { [key]: 1 });
      expect(result.status, key).toBe(400);
      expect((result.body as { error: string }).error).toContain(`'${key}'`);
    }
    expect(config.set).not.toHaveBeenCalled();
  });
});

describe("settings.* — Overlay e Acessibilidade", () => {
  it("opacidade na faixa do slider", async () => {
    const { call, values } = setup();
    expect((await call("settings.updateOverlay", { opacity: 19 })).status).toBe(400);
    expect((await call("settings.updateOverlay", { opacity: 100.5 })).status).toBe(400);
    const ok = await call("settings.updateOverlay", { opacity: 20 });
    expect(ok).toEqual({ status: 200, body: { opacity: 20, snapToGrid: false } });
    expect(values.overlayOpacity).toBe(20);
  });

  it("modo e acento só das opções da tela, com o tema aplicado", async () => {
    const { call, system } = setup();
    expect((await call("settings.updateAccessibility", { accent: "rosa" })).status).toBe(400);
    const result = await call("settings.updateAccessibility", { accent: "ambar" });
    expect(result).toEqual({ status: 200, body: { mode: "escuro", accent: "ambar" } });
    expect(system.applyAppearance).toHaveBeenCalledWith({ mode: "escuro", accent: "ambar" });
    expect((await call("settings.getAccessibility")).body).toEqual({
      mode: "escuro",
      accent: "ambar",
    });
  });

  it("mostrar/ocultar overlay devolve a visibilidade", async () => {
    const { call, system } = setup();
    system.toggleOverlay.mockResolvedValue(false);
    expect(await call("overlay.toggle")).toEqual({ status: 200, body: { visible: false } });
  });

  it("redefinir posições responde 204", async () => {
    const { call, values } = setup();
    expect((await call("settings.resetWindowPositions")).status).toBe(204);
    expect(values.mainWindowPosition).toEqual({ x: -1, y: -1 });
  });
});

describe("settings.* — Atalhos", () => {
  it("mescla o parcial com os atuais, registra os quatro e grava", async () => {
    const { call, system, values } = setup({ shortcutStopTask: "CmdOrCtrl+S" });
    const result = await call("settings.updateShortcuts", { toggleTask: "CmdOrCtrl+Shift+P" });
    expect(result).toEqual({
      status: 200,
      body: {
        shortcuts: {
          toggleTask: "CmdOrCtrl+Shift+P",
          stopTask: "CmdOrCtrl+S",
          toggleOverlay: "",
          toggleWindow: "",
        },
        failedShortcuts: [],
        warning: null,
      },
    });
    expect(system.registerShortcuts).toHaveBeenCalledOnce();
    expect(values.shortcutToggleTask).toBe("CmdOrCtrl+Shift+P");
  });

  it("recusa do sistema grava assim mesmo e volta com o aviso da tela", async () => {
    const { call, system, values } = setup();
    system.registerShortcuts.mockResolvedValue(["Alt+O"]);
    const result = await call("settings.updateShortcuts", { toggleOverlay: "Alt+O" });
    expect(result.status).toBe(200);
    expect(result.body).toMatchObject({
      failedShortcuts: ["Alt+O"],
      warning: "Um atalho não pôde ser registrado — pode estar em uso por outro aplicativo.",
    });
    expect(values.shortcutToggleOverlay).toBe("Alt+O");
  });

  it("no Wayland, o aviso é o do Wayland", async () => {
    const { call, system } = setup();
    system.displayServer.mockResolvedValue("wayland");
    const result = await call("settings.updateShortcuts", { toggleWindow: "F5" });
    expect(result.body).toMatchObject({ warning: WAYLAND_SHORTCUTS_WARNING });
  });

  it("forma inválida ou conflito entre ações é 400 antes de registrar", async () => {
    const { call, system, config } = setup({ shortcutStopTask: "Alt+O" });
    const invalid = await call("settings.updateShortcuts", { toggleTask: "Ctrl+Banana+" });
    expect(invalid.status).toBe(400);
    const conflict = await call("settings.updateShortcuts", { toggleOverlay: "Alt+O" });
    expect(conflict).toEqual({
      status: 400,
      body: {
        error:
          'O atalho "Alt+O" já está em "Parar" — escolha outro para "Mostrar / Ocultar overlay".',
      },
    });
    expect(system.registerShortcuts).not.toHaveBeenCalled();
    expect(config.set).not.toHaveBeenCalled();
  });

  it("conflito que já estava gravado não barra a edição de outra ação", async () => {
    // A tela grava o mesmo atalho em duas ações; a API não pode travar por isso.
    const { call, system } = setup({ shortcutToggleTask: "Alt+O", shortcutStopTask: "Alt+O" });
    const result = await call("settings.updateShortcuts", { toggleWindow: "F5" });
    expect(result.status).toBe(200);
    expect(system.registerShortcuts).toHaveBeenCalled();

    const again = await call("settings.updateShortcuts", { toggleOverlay: "Alt+O" });
    expect(again.status).toBe(400);
  });

  it('"" remove o atalho', async () => {
    const { call, values } = setup({ shortcutStopTask: "Alt+O" });
    expect((await call("settings.updateShortcuts", { stopTask: "" })).status).toBe(200);
    expect(values.shortcutStopTask).toBe("");
  });
});
