const SIZES: Record<string, string> = {
  P: "13px",
  M: "14px",
  G: "16px",
  GG: "18px",
};

export function applyFontSize(size: string): void {
  document.documentElement.style.setProperty("--app-font-size", SIZES[size] ?? SIZES.M);
}
