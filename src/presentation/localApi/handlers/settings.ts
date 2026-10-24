import {
  DAILY_GOAL_RANGE,
  OVERLAY_OPACITY_RANGE,
  ROUNDING_TOLERANCE_OPTIONS,
  WEEKLY_GOAL_RANGE,
  isRoundingSlot,
} from "@domain/usecases/settings/settingsRules";
import {
  SHORTCUTS,
  shortcutConflictError,
  shortcutFormatError,
  shortcutsWarning,
  type ShortcutName,
  type ShortcutValues,
} from "@domain/usecases/settings/shortcuts";
import type {
  AccessibilitySettings,
  GeneralSettings,
  OverlaySettings,
  ShortcutsUpdate,
} from "@presentation/settings/settingsGroups";
import { DomainError } from "@shared/errors";
import { boolean, integerIn, oneOf, parsePatch, text, type Validator } from "../patchRules";
import { ACCENTS, MODES } from "@shared/utils/theme";
import type { LocalApiHandler } from "../types";

/**
 * Configurações por grupo (Fase D3a da paridade). Cada grupo tem leitura e
 * edição parcial: ausente mantém, e o que veio passa pela validação da chave —
 * o que a tela não deixa escolher (fora da faixa, fora das opções) é 400. A
 * gravação e os efeitos são os das abas, pela porta `deps.settings`.
 */

const roundingSlots: Validator = (value, key) =>
  Array.isArray(value) && value.every(isRoundingSlot)
    ? null
    : `${key} deve ser uma lista de slots em minutos, múltiplos de 5 até 60 (lista vazia = nenhum).`;

const GENERAL_RULES: Record<keyof GeneralSettings, Validator> = {
  userName: text,
  startOnBoot: boolean,
  closeOnFocusLoss: boolean,
  showIntegrationsRail: boolean,
  discardTasksUnderOneMinute: boolean,
  roundingEnabled: boolean,
  roundingSlots,
  roundingTolerance: oneOf(ROUNDING_TOLERANCE_OPTIONS),
  dailyGoalHours: integerIn(DAILY_GOAL_RANGE, " horas"),
  weeklyGoalHours: integerIn(WEEKLY_GOAL_RANGE, " horas"),
  weekStartsOn: oneOf(["monday", "sunday"]),
  showWeekend: boolean,
};

const OVERLAY_RULES: Record<keyof OverlaySettings, Validator> = {
  opacity: integerIn(OVERLAY_OPACITY_RANGE, "%"),
  snapToGrid: boolean,
};

const ACCESSIBILITY_RULES: Record<keyof AccessibilitySettings, Validator> = {
  mode: oneOf(MODES),
  accent: oneOf(ACCENTS),
};

const SHORTCUT_RULES: Record<ShortcutName, Validator> = Object.fromEntries(
  SHORTCUTS.map(({ name, label }) => [
    name,
    (value: unknown, key: string) =>
      typeof value === "string"
        ? shortcutFormatError(label, value)
        : `${key} deve ser texto ("" remove o atalho).`,
  ])
) as Record<ShortcutName, Validator>;

export const getGeneralSettings: LocalApiHandler = async (deps) => ({
  status: 200,
  body: await deps.settings.general(),
});

export const updateGeneralSettings: LocalApiHandler = async (deps, params) => {
  const patch = parsePatch<GeneralSettings>(params.body, GENERAL_RULES, "Geral");
  return { status: 200, body: await deps.settings.updateGeneral(patch) };
};

export const getOverlaySettings: LocalApiHandler = async (deps) => ({
  status: 200,
  body: deps.settings.overlay(),
});

export const updateOverlaySettings: LocalApiHandler = async (deps, params) => {
  const patch = parsePatch<OverlaySettings>(params.body, OVERLAY_RULES, "Overlay");
  return { status: 200, body: await deps.settings.updateOverlay(patch) };
};

export const getAccessibilitySettings: LocalApiHandler = async (deps) => ({
  status: 200,
  body: deps.settings.accessibility(),
});

export const updateAccessibilitySettings: LocalApiHandler = async (deps, params) => {
  const patch = parsePatch<AccessibilitySettings>(
    params.body,
    ACCESSIBILITY_RULES,
    "Acessibilidade"
  );
  return { status: 200, body: await deps.settings.updateAccessibility(patch) };
};

export const getShortcutSettings: LocalApiHandler = async (deps) => ({
  status: 200,
  body: deps.settings.shortcuts(),
});

/**
 * Como a tela: registra os quatro no sistema e grava os quatro, mesmo o que o
 * sistema recusou — a resposta traz os recusados e o aviso da tela. Forma
 * inválida e o mesmo atalho em duas ações são 400 antes de registrar nada —
 * o conflito só conta se o PATCH o criou, porque a tela grava conflito.
 */
export const updateShortcutSettings: LocalApiHandler = async (deps, params) => {
  const patch = parsePatch<ShortcutValues>(params.body, SHORTCUT_RULES, "Atalhos");
  const values: ShortcutValues = { ...deps.settings.shortcuts(), ...patch };
  const conflict = shortcutConflictError(values, new Set(Object.keys(patch)));
  if (conflict) throw new DomainError(conflict);
  const { failed, displayServer } = await deps.settings.updateShortcuts(values);
  const body: ShortcutsUpdate = {
    shortcuts: values,
    failedShortcuts: failed,
    warning: shortcutsWarning(failed.length, displayServer),
  };
  return { status: 200, body };
};

export const toggleOverlayHandler: LocalApiHandler = async (deps) => ({
  status: 200,
  body: { visible: await deps.settings.toggleOverlay() },
});

export const resetWindowPositionsHandler: LocalApiHandler = async (deps) => {
  await deps.settings.resetWindowPositions();
  return { status: 204, body: null };
};
