/**
 * Os quatro atalhos globais de Configurações → Atalhos: a chave de cada um na
 * config, a ação que o Rust registra (`update_shortcuts`) e o rótulo da linha.
 * A tela, o registro no boot (`useGlobalShortcuts`) e a API local montam o
 * mesmo pedido daqui.
 */

export type ShortcutName = "toggleTask" | "stopTask" | "toggleOverlay" | "toggleWindow";

export type ShortcutValues = Record<ShortcutName, string>;

export type ShortcutConfigKey =
  "shortcutToggleTask" | "shortcutStopTask" | "shortcutToggleOverlay" | "shortcutToggleWindow";

export interface ShortcutDefinition {
  name: ShortcutName;
  configKey: ShortcutConfigKey;
  action: "toggle-task" | "stop-task" | "toggle-overlay" | "toggle-window";
  label: string;
}

/** Na ordem das linhas da tela — e do pedido ao Rust. */
export const SHORTCUTS: readonly ShortcutDefinition[] = [
  {
    name: "toggleTask",
    configKey: "shortcutToggleTask",
    action: "toggle-task",
    label: "Iniciar / Pausar / Retomar",
  },
  { name: "stopTask", configKey: "shortcutStopTask", action: "stop-task", label: "Parar" },
  {
    name: "toggleOverlay",
    configKey: "shortcutToggleOverlay",
    action: "toggle-overlay",
    label: "Mostrar / Ocultar overlay",
  },
  {
    name: "toggleWindow",
    configKey: "shortcutToggleWindow",
    action: "toggle-window",
    label: "Mostrar / Ocultar janela",
  },
];

export interface ShortcutRegistration {
  action: ShortcutDefinition["action"];
  accelerator: string;
}

/** O pedido do `update_shortcuts`: os quatro, vazio inclusive (o Rust pula o vazio). */
export function shortcutRegistrations(values: ShortcutValues): ShortcutRegistration[] {
  return SHORTCUTS.map(({ name, action }) => ({ action, accelerator: values[name] }));
}

/** O aviso da tela no Wayland, onde o registro global não funciona. */
export const WAYLAND_SHORTCUTS_WARNING =
  "Atalhos globais usam XGrabKey e não funcionam no Wayland. Execute o app em XWayland ou mude para uma sessão X11 para usar este recurso.";

/** O aviso da tela quando o sistema recusou registrar algum atalho. */
export function failedShortcutsWarning(count: number): string {
  return count === 1
    ? "Um atalho não pôde ser registrado — pode estar em uso por outro aplicativo."
    : `${count} atalhos não puderam ser registrados — podem estar em uso por outro aplicativo.`;
}

/**
 * O aviso que a tela mostraria depois de gravar: no Wayland, sempre o do
 * Wayland; fora dele, o de falha, se houve. `null` sem aviso.
 */
export function shortcutsWarning(failedCount: number, displayServer: string): string | null {
  if (displayServer === "wayland") return WAYLAND_SHORTCUTS_WARNING;
  return failedCount > 0 ? failedShortcutsWarning(failedCount) : null;
}

/** Os modificadores que o gravador da tela produz (`buildAccelerator`), nesta grafia. */
const RECORDED_MODIFIERS = new Set(["CmdOrCtrl", "Shift", "Alt"]);

/**
 * Tecla base: um caractere visível que não seja o separador, ou um nome de
 * tecla (`F5`, `Space`, `ArrowUp`, `Enter`) — o que o gravador tira do teclado.
 */
const KEY_PATTERN = /^(?:[^\s+]|[A-Za-z][A-Za-z0-9]*)$/;

/**
 * O que a tela não deixa gravar. Ela só grava pelo teclado, então nunca produz
 * um atalho fora da forma "modificadores + tecla"; pela API chega texto livre.
 * `null` = forma válida (vazio inclusive: é o "Remover atalho"). Se o sistema
 * recusa registrar, isso não é forma: é o aviso de falha, como na tela.
 */
export function shortcutFormatError(label: string, accelerator: string): string | null {
  if (accelerator === "") return null;
  const parts = accelerator.split("+");
  const key = parts[parts.length - 1];
  const modifiers = parts.slice(0, -1);
  const validModifiers =
    modifiers.every((m) => RECORDED_MODIFIERS.has(m)) &&
    new Set(modifiers).size === modifiers.length;
  if (!validModifiers || RECORDED_MODIFIERS.has(key) || !KEY_PATTERN.test(key)) {
    return `Atalho inválido em "${label}": "${accelerator}". Use modificadores CmdOrCtrl, Shift e Alt seguidos de uma tecla, separados por "+" (ex.: CmdOrCtrl+Shift+P).`;
  }
  return null;
}

/**
 * O mesmo atalho em duas ações. A tela não confere — o sistema recusa o
 * segundo registro e a tela mostra o aviso de falha nas duas linhas —; a API
 * recusa antes de registrar. `null` sem conflito.
 */
/**
 * Com `changed`, só conta o conflito em que uma das ações está entre as
 * alteradas: a tela deixa gravar o mesmo atalho em duas ações, e um conflito
 * que já estava no banco não pode barrar a edição de uma terceira.
 */
export function shortcutConflictError(
  values: ShortcutValues,
  changed?: ReadonlySet<string>
): string | null {
  const seen = new Map<string, { name: string; label: string }>();
  for (const { name, label } of SHORTCUTS) {
    const accelerator = values[name];
    if (!accelerator) continue;
    const key = accelerator.toLowerCase();
    const other = seen.get(key);
    if (other && (!changed || changed.has(name) || changed.has(other.name)))
      return `O atalho "${accelerator}" já está em "${other.label}" — escolha outro para "${label}".`;
    if (!other) seen.set(key, { name, label });
  }
  return null;
}
