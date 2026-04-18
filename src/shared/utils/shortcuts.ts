const MODIFIERS = new Set(["cmdorctrl", "ctrl", "shift", "alt", "meta"]);

export function matchesShortcut(e: KeyboardEvent, acc: string): boolean {
  if (!acc) return false;
  const parts = acc.toLowerCase().split("+");
  const wantCtrl = parts.includes("cmdorctrl") || parts.includes("ctrl");
  const wantShift = parts.includes("shift");
  const wantAlt = parts.includes("alt");
  const keyPart = parts.find((p) => !MODIFIERS.has(p)) ?? "";

  if (wantCtrl !== (e.ctrlKey || e.metaKey)) return false;
  if (wantShift !== e.shiftKey) return false;
  if (wantAlt !== e.altKey) return false;

  const eKey = e.key.toLowerCase();
  return eKey === keyPart || (eKey === " " && keyPart === "space");
}

export function formatShortcut(acc: string): string {
  if (!acc) return "";
  return acc.replace(/CmdOrCtrl/gi, "Ctrl").replace(/Meta/gi, "Cmd");
}
