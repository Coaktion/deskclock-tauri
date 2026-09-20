import type { RowKeyMap } from "@presentation/components/rowKey";

/**
 * O que a linha planejada faz com uma tecla, quando o foco está **nela**. Os
 * atalhos de letra são os mesmos do menu (`E` · `D` · `L` · `Del`), então quem
 * aprendeu um aprendeu o outro. As regras (modificador, repetição, setas) são
 * as do `rowKey`; aqui mora só o mapa.
 */
export const PLANNED_ROW_KEYS: RowKeyMap<
  "play" | "toggleComplete" | "edit" | "duplicate" | "copyLink" | "delete"
> = {
  Enter: "play",
  " ": "toggleComplete",
  e: "edit",
  d: "duplicate",
  l: "copyLink",
  Delete: "delete",
};
