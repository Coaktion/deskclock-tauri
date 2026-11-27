import { vi } from "vitest";
import type { AppConfig, ConfigKey } from "@shared/types/appConfig";
import type { SettingsConfig, SettingsSystem } from "@presentation/settings/settingsEffects";

/** Config em memória e o sistema mockado na fronteira (autostart, atalhos, eventos). */
export function makeSettingsDoubles(initial: Partial<AppConfig> = {}) {
  const values: Partial<AppConfig> = {
    userName: "Ana",
    startOnBoot: false,
    closeOnFocusLoss: false,
    showIntegrationsRail: true,
    discardTasksUnderOneMinute: false,
    roundingEnabled: false,
    roundingSlots: [15, 30, 45, 60],
    roundingTolerance: 0,
    dailyGoalHours: 8,
    weeklyGoalHours: 40,
    weekStartsOn: 1,
    showWeekend: false,
    overlayOpacity: 100,
    overlaySnapToGrid: false,
    mode: "",
    accent: "",
    theme: "azul",
    shortcutToggleTask: "",
    shortcutStopTask: "",
    shortcutToggleOverlay: "",
    shortcutToggleWindow: "",
    ...initial,
  };
  const order: string[] = [];
  const get = vi.fn((key: ConfigKey) => values[key]);
  const set = vi.fn(async (key: ConfigKey, value: unknown) => {
    order.push(`set:${key}`);
    (values as Record<string, unknown>)[key] = value;
  });
  // O `get` genérico da config não se deixa satisfazer por um mock; o cast fica
  // só aqui, e os testes enxergam os dois mocks.
  const config = { get, set } as unknown as SettingsConfig & { get: typeof get; set: typeof set };
  const system = {
    autostart: {
      enable: vi.fn(async () => {
        order.push("autostart:enable");
      }),
      disable: vi.fn(async () => {
        order.push("autostart:disable");
      }),
      isEnabled: vi.fn(async () => true),
    },
    registerShortcuts: vi.fn(async (): Promise<string[]> => []),
    toggleOverlay: vi.fn(async () => true),
    displayServer: vi.fn(async () => "x11"),
    emitConfigChanged: vi.fn(async (key: string, _value: unknown) => {
      order.push(`emit:${key}`);
    }),
    applyAppearance: vi.fn(),
  } satisfies SettingsSystem;
  return { values, config, system, order };
}
