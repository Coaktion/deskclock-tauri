import { useId } from "react";

/**
 * Prefixo para os `id` de `<defs>` (gradiente, máscara, filtro) dos logos. Os
 * ids são globais no documento: duas cópias do mesmo logo na tela — o rail e a
 * sub-seção, por exemplo — resolveriam o `url(#a)` da segunda para a primeira.
 *
 * O `useId` do React 19 devolve `«r0»`, e esses caracteres não sobrevivem a
 * todo parser de `url(#…)`; por isso só letra, número, `_` e `-` ficam.
 */
export function useSvgIdPrefix(): string {
  return `g${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
}
