/**
 * O que a linha planejada faz com uma tecla, quando o foco está **nela**. Os
 * atalhos de letra são os mesmos do menu (`E` · `D` · `L` · `Del`), então quem
 * aprendeu um aprendeu o outro.
 */
export type PlannedRowAction =
  | "play"
  | "toggleComplete"
  | "edit"
  | "duplicate"
  | "copyLink"
  | "delete"
  | "focusNext"
  | "focusPrev";

type KeyLike = Pick<KeyboardEvent, "key" | "ctrlKey" | "metaKey" | "altKey" | "repeat">;

const KEYS = new Map<string, PlannedRowAction>([
  ["Enter", "play"],
  [" ", "toggleComplete"],
  ["e", "edit"],
  ["d", "duplicate"],
  ["l", "copyLink"],
  ["Delete", "delete"],
  ["ArrowDown", "focusNext"],
  ["ArrowUp", "focusPrev"],
]);

/**
 * `null` com modificador: a linha não pode roubar `Ctrl+Z` (o desfazer da
 * exclusão), `Ctrl+C` nem atalho nenhum do sistema. As letras valem nas duas
 * caixas — com Caps Lock ligado, `E` ainda edita.
 *
 * `null` também na **repetição** da tecla segurada, exceto nas setas: segurar
 * `D` criaria duplicatas em série (e o desfazer só cobre exclusão), segurar o
 * Espaço alternaria a conclusão a cada repetição e segurar o Enter chamaria o
 * Play em série. Nas setas, segurar para descer a lista é o gesto esperado.
 */
export function plannedRowKey(e: KeyLike): PlannedRowAction | null {
  if (e.ctrlKey || e.metaKey || e.altKey) return null;
  const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
  const action = KEYS.get(key) ?? null;
  if (e.repeat && action !== "focusNext" && action !== "focusPrev") return null;
  return action;
}
