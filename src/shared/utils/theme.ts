export const THEMES = ["azul", "verde", "escuro", "claro"] as const;
export type Theme = (typeof THEMES)[number];

export function applyTheme(theme: Theme): void {
  if (theme === "azul") {
    delete document.documentElement.dataset.theme;
  } else {
    document.documentElement.dataset.theme = theme;
  }
}
