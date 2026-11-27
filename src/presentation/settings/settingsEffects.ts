import { invoke } from "@tauri-apps/api/core";
import { emit } from "@tauri-apps/api/event";
import { disable, enable, isEnabled } from "@tauri-apps/plugin-autostart";
import {
  SHORTCUTS,
  shortcutRegistrations,
  type ShortcutRegistration,
  type ShortcutValues,
} from "@domain/usecases/settings/shortcuts";
import type { ConfigContextValue, WeekStart } from "@shared/types/appConfig";
import { OVERLAY_EVENTS, type OverlayConfigChangedPayload } from "@shared/types/overlayEvents";
import {
  applyAppearance,
  resolveAppearance,
  type Accent,
  type Appearance,
  type Mode,
} from "@shared/utils/theme";

/**
 * O que gravar uma chave de Configurações faz **além** de gravar: registrar no
 * sistema operacional, avisar as outras janelas, repintar. As abas e a API
 * local chamam as mesmas funções daqui, para não haver uma segunda cópia do
 * efeito que divirja calada.
 */
export interface SettingsSystem {
  autostart: {
    enable(): Promise<void>;
    disable(): Promise<void>;
    isEnabled(): Promise<boolean>;
  };
  /** Devolve os atalhos que o sistema recusou registrar. */
  registerShortcuts(shortcuts: ShortcutRegistration[]): Promise<string[]>;
  /** Mostra o compacto, ou esconde compacto e popup. Devolve se ficou visível. */
  toggleOverlay(): Promise<boolean>;
  /** `wayland`, `x11` ou `""` fora do Linux. */
  displayServer(): Promise<string>;
  emitConfigChanged(key: string, value: unknown): Promise<void>;
  applyAppearance(appearance: Appearance): void;
}

export const tauriSettingsSystem: SettingsSystem = {
  autostart: { enable, disable, isEnabled },
  registerShortcuts: (shortcuts) => invoke<string[]>("update_shortcuts", { shortcuts }),
  toggleOverlay: () => invoke<boolean>("toggle_overlay"),
  displayServer: () => invoke<string>("get_display_server"),
  emitConfigChanged: (key, value) =>
    emit(OVERLAY_EVENTS.OVERLAY_CONFIG_CHANGED, {
      key,
      value,
    } satisfies OverlayConfigChangedPayload),
  applyAppearance,
};

export type SettingsConfig = Pick<ConfigContextValue, "get" | "set">;

export async function saveStartOnBoot(
  config: SettingsConfig,
  system: SettingsSystem,
  value: boolean
): Promise<void> {
  await config.set("startOnBoot", value);
  if (value) await system.autostart.enable();
  else await system.autostart.disable();
}

/** Emite para as outras janelas: a config delas é o retrato do mount. */
export async function saveWeekStartsOn(
  config: SettingsConfig,
  system: SettingsSystem,
  value: WeekStart
): Promise<void> {
  await config.set("weekStartsOn", value);
  await system.emitConfigChanged("weekStartsOn", value);
}

/** Também emite: o editor de planejada do popup lê esta config. */
export async function saveShowWeekend(
  config: SettingsConfig,
  system: SettingsSystem,
  value: boolean
): Promise<void> {
  await config.set("showWeekend", value);
  await system.emitConfigChanged("showWeekend", value);
}

/** A aparência gravada, com a migração do `theme` legado por eixo. */
export function currentAppearance(config: SettingsConfig): Appearance {
  return resolveAppearance({
    mode: config.get("mode"),
    accent: config.get("accent"),
    theme: config.get("theme"),
  });
}

/**
 * Troca um eixo da aparência: repinta esta janela, grava e avisa as outras.
 * Devolve a aparência resultante.
 */
export async function saveAppearance(
  config: SettingsConfig,
  system: SettingsSystem,
  current: Appearance,
  key: "mode" | "accent",
  value: Mode | Accent
): Promise<Appearance> {
  const next = resolveAppearance({ ...current, [key]: value });
  system.applyAppearance(next);
  await config.set(key, value as never);
  await system.emitConfigChanged(key, value);
  return next;
}

export async function saveOverlayOpacity(
  config: SettingsConfig,
  system: SettingsSystem,
  value: number
): Promise<void> {
  await config.set("overlayOpacity", value);
  await system.emitConfigChanged("overlayOpacity", value);
}

export async function saveOverlaySnapToGrid(
  config: SettingsConfig,
  system: SettingsSystem,
  value: boolean
): Promise<void> {
  await config.set("overlaySnapToGrid", value);
  await system.emitConfigChanged("overlaySnapToGrid", value);
}

export function currentShortcuts(config: SettingsConfig): ShortcutValues {
  return Object.fromEntries(
    SHORTCUTS.map(({ name, configKey }) => [name, config.get(configKey)])
  ) as ShortcutValues;
}

/**
 * Registra os quatro atalhos no sistema e grava os quatro — inclusive o que o
 * sistema recusou, como a tela sempre fez: o recusado fica gravado e é tentado
 * de novo no próximo boot. Devolve os recusados.
 */
export async function saveShortcuts(
  config: SettingsConfig,
  system: SettingsSystem,
  values: ShortcutValues
): Promise<string[]> {
  const failed = await system.registerShortcuts(shortcutRegistrations(values));
  for (const { name, configKey } of SHORTCUTS) {
    await config.set(configKey, values[name]);
  }
  return failed;
}

/** "Redefinir posições salvas das janelas": `{ x: -1, y: -1 }` é a posição nunca salva. */
export async function resetWindowPositions(config: SettingsConfig): Promise<void> {
  const unset = { x: -1, y: -1 };
  await config.set("mainWindowPosition", unset);
  await config.set("overlayPosition_execution", unset);
  await config.set("overlayPosition_planning", unset);
  await config.set("overlayPosition_compact", unset);
}
