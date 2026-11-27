import { normalizeRoundingSlots } from "@domain/usecases/settings/settingsRules";
import type { ShortcutValues } from "@domain/usecases/settings/shortcuts";
import type { WeekStart } from "@shared/types/appConfig";
import type { Accent, Mode } from "@shared/utils/theme";
import type { RoundingSlot } from "@shared/utils/roundDuration";
import {
  currentAppearance,
  currentShortcuts,
  resetWindowPositions,
  saveAppearance,
  saveOverlayOpacity,
  saveOverlaySnapToGrid,
  saveShortcuts,
  saveShowWeekend,
  saveStartOnBoot,
  saveWeekStartsOn,
  type SettingsConfig,
  type SettingsSystem,
} from "./settingsEffects";

/**
 * Os grupos de Configurações que a API local lê e grava, um por aba: Geral,
 * Overlay, Acessibilidade (a aba Aparência) e Atalhos. É uma porta estreita
 * por grupo, de propósito: cada chave tem tipo próprio e efeito próprio, e um
 * key-value genérico deixaria a API gravar segredo, posição de janela e estado
 * interno de integração.
 *
 * A validação mora no handler da API; aqui chega o que já passou por ela, e a
 * gravação passa pelas mesmas funções das abas (`settingsEffects.ts`).
 */

export type WeekStartName = "monday" | "sunday";

const WEEK_START_BY_NAME: Record<WeekStartName, WeekStart> = { monday: 1, sunday: 0 };

export interface GeneralSettings {
  userName: string;
  startOnBoot: boolean;
  closeOnFocusLoss: boolean;
  showIntegrationsRail: boolean;
  discardTasksUnderOneMinute: boolean;
  roundingEnabled: boolean;
  roundingSlots: RoundingSlot[];
  roundingTolerance: number;
  dailyGoalHours: number;
  weeklyGoalHours: number;
  weekStartsOn: WeekStartName;
  showWeekend: boolean;
}

export interface OverlaySettings {
  /** Opacidade em repouso, em %. */
  opacity: number;
  snapToGrid: boolean;
}

export interface AccessibilitySettings {
  mode: Mode;
  accent: Accent;
}

export interface ShortcutsUpdate {
  shortcuts: ShortcutValues;
  /** Os atalhos que o sistema recusou registrar — ficam gravados, como na tela. */
  failedShortcuts: string[];
  /** O aviso que a tela mostraria (Wayland ou falha de registro). */
  warning: string | null;
}

export interface SettingsPort {
  general(): Promise<GeneralSettings>;
  updateGeneral(patch: Partial<GeneralSettings>): Promise<GeneralSettings>;
  overlay(): OverlaySettings;
  updateOverlay(patch: Partial<OverlaySettings>): Promise<OverlaySettings>;
  accessibility(): AccessibilitySettings;
  updateAccessibility(patch: Partial<AccessibilitySettings>): Promise<AccessibilitySettings>;
  shortcuts(): ShortcutValues;
  /** Grava os quatro, já validados, e registra no sistema. */
  updateShortcuts(values: ShortcutValues): Promise<{ failed: string[]; displayServer: string }>;
  /** "Mostrar / Ocultar overlay". Devolve se o overlay ficou visível. */
  toggleOverlay(): Promise<boolean>;
  resetWindowPositions(): Promise<void>;
}

/** Chaves do Geral sem efeito além de gravar: quem as usa lê a config na hora. */
const PLAIN_GENERAL_KEYS = [
  "userName",
  "closeOnFocusLoss",
  "showIntegrationsRail",
  "discardTasksUnderOneMinute",
  "roundingEnabled",
  "roundingTolerance",
  "dailyGoalHours",
  "weeklyGoalHours",
] as const;

export function buildSettingsPort(config: SettingsConfig, system: SettingsSystem): SettingsPort {
  async function general(): Promise<GeneralSettings> {
    // A aba lê o estado do sistema, não a chave: é o que de fato vale no boot.
    let startOnBoot = config.get("startOnBoot");
    try {
      startOnBoot = await system.autostart.isEnabled();
    } catch {
      // Sem o plugin (ou fora do desktop), a chave gravada é o melhor que há.
    }
    const weekStartsOn = config.get("weekStartsOn");
    return {
      userName: config.get("userName"),
      startOnBoot,
      closeOnFocusLoss: config.get("closeOnFocusLoss"),
      showIntegrationsRail: config.get("showIntegrationsRail"),
      discardTasksUnderOneMinute: config.get("discardTasksUnderOneMinute"),
      roundingEnabled: config.get("roundingEnabled"),
      roundingSlots: config.get("roundingSlots"),
      roundingTolerance: config.get("roundingTolerance"),
      dailyGoalHours: config.get("dailyGoalHours"),
      weeklyGoalHours: config.get("weeklyGoalHours"),
      weekStartsOn: weekStartsOn === 0 ? "sunday" : "monday",
      showWeekend: config.get("showWeekend"),
    };
  }

  function overlay(): OverlaySettings {
    return {
      opacity: config.get("overlayOpacity"),
      snapToGrid: config.get("overlaySnapToGrid"),
    };
  }

  return {
    general,
    async updateGeneral(patch) {
      for (const key of PLAIN_GENERAL_KEYS) {
        const value = patch[key];
        if (value !== undefined) await config.set(key, value as never);
      }
      if (patch.roundingSlots !== undefined) {
        await config.set("roundingSlots", normalizeRoundingSlots(patch.roundingSlots));
      }
      if (patch.startOnBoot !== undefined) {
        await saveStartOnBoot(config, system, patch.startOnBoot);
      }
      if (patch.weekStartsOn !== undefined) {
        await saveWeekStartsOn(config, system, WEEK_START_BY_NAME[patch.weekStartsOn]);
      }
      if (patch.showWeekend !== undefined) {
        await saveShowWeekend(config, system, patch.showWeekend);
      }
      return general();
    },
    overlay,
    async updateOverlay(patch) {
      if (patch.opacity !== undefined) await saveOverlayOpacity(config, system, patch.opacity);
      if (patch.snapToGrid !== undefined) {
        await saveOverlaySnapToGrid(config, system, patch.snapToGrid);
      }
      return overlay();
    },
    accessibility: () => currentAppearance(config),
    async updateAccessibility(patch) {
      let appearance = currentAppearance(config);
      if (patch.mode !== undefined) {
        appearance = await saveAppearance(config, system, appearance, "mode", patch.mode);
      }
      if (patch.accent !== undefined) {
        appearance = await saveAppearance(config, system, appearance, "accent", patch.accent);
      }
      return appearance;
    },
    shortcuts: () => currentShortcuts(config),
    async updateShortcuts(values) {
      const failed = await saveShortcuts(config, system, values);
      return { failed, displayServer: await system.displayServer().catch(() => "") };
    },
    toggleOverlay: () => system.toggleOverlay(),
    resetWindowPositions: () => resetWindowPositions(config),
  };
}
