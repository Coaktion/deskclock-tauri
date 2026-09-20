import type { RowKeyMap } from "@presentation/components/rowKey";

/**
 * O teclado do lançamento nas Entradas de hoje (`TaskCard`), com o foco na
 * própria linha. Sem Espaço, porque lançamento não se conclui, e sem `D`/`L`,
 * porque o menu dele não tem Duplicar nem Copiar link — a letra só entra onde o
 * item existe. As regras (modificador, repetição, setas) são as do `rowKey`.
 */
export const ENTRY_ROW_KEYS: RowKeyMap<"play" | "edit" | "delete"> = {
  Enter: "play",
  e: "edit",
  Delete: "delete",
};

/**
 * O teclado do lançamento **passado** — as linhas do Histórico e do Lançamento
 * Manual (`DayEntryRow`). É o `ENTRY_ROW_KEYS` menos o Enter: ali não há ▶, e
 * um Enter sem ação a que corresponder seria consumido por nada.
 */
export const DAY_ENTRY_ROW_KEYS: RowKeyMap<"edit" | "delete"> = {
  e: "edit",
  Delete: "delete",
};

/**
 * O cabeçalho do grupo nas Entradas (`TaskGroupCard`): só o `E` do "Editar
 * grupo", o único item do menu dele com atalho. Enter e Espaço **não** expandem
 * — expandir pelo teclado não existia, e o spec não o pede.
 */
export const GROUP_ROW_KEYS: RowKeyMap<"editGroup"> = {
  e: "editGroup",
};
