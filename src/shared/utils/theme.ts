export const MODES = ["escuro", "claro"] as const;
export type Mode = (typeof MODES)[number];

export const ACCENTS = ["azul", "verde", "roxo", "ambar"] as const;
export type Accent = (typeof ACCENTS)[number];

export interface Appearance {
  mode: Mode;
  accent: Accent;
}

/**
 * Vocabulário antigo: uma chave só para os dois eixos. Não é mais escrito em
 * lugar nenhum — sobrevive porque `config` guarda o valor de quem escolheu tema
 * antes da separação, e é dele que a aparência é migrada na leitura.
 */
type Theme = "azul" | "verde" | "escuro" | "claro";

const DEFAULT_APPEARANCE: Appearance = { mode: "escuro", accent: "azul" };

/**
 * O tema "escuro" (que trocava a rampa de cinza por zinc) não tem para onde ir:
 * o modelo de dois eixos não expressa "outro neutro". Quem estava nele cai no
 * escuro azul e perde o tom zinc.
 */
const FROM_LEGACY_THEME: Record<Theme, Appearance> = {
  azul: { mode: "escuro", accent: "azul" },
  verde: { mode: "escuro", accent: "verde" },
  escuro: { mode: "escuro", accent: "azul" },
  claro: { mode: "claro", accent: "azul" },
};

/**
 * O eixo que não tiver valor próprio é migrado do tema legado — por eixo, não em
 * bloco: quem trocar só o acento continua com o modo vindo do tema antigo.
 */
export function resolveAppearance(stored: {
  mode?: string;
  accent?: string;
  theme?: string;
}): Appearance {
  const legacy = FROM_LEGACY_THEME[stored.theme as Theme] ?? DEFAULT_APPEARANCE;
  return {
    mode: MODES.includes(stored.mode as Mode) ? (stored.mode as Mode) : legacy.mode,
    accent: ACCENTS.includes(stored.accent as Accent) ? (stored.accent as Accent) : legacy.accent,
  };
}

export function applyAppearance({ mode, accent }: Appearance): void {
  const root = document.documentElement;
  root.dataset.mode = mode;
  root.dataset.accent = accent;
}

/** Lê de volta o que `applyAppearance` gravou no documento. */
export function readAppliedAppearance(): Appearance {
  const { mode, accent } = document.documentElement.dataset;
  return resolveAppearance({ mode, accent });
}
