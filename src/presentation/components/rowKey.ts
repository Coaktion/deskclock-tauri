import type { KeyboardEvent } from "react";

/**
 * O teclado de uma linha de tarefa focada, comum a toda lista que a adota. Cada
 * tela passa o **seu** mapa de tecla → ação, porque nem toda linha tem tudo: a
 * letra só entra onde o item do menu existe (`E` · `D` · `L` · `Del`), e o
 * Enter/Espaço só onde há Play e conclusão. As setas não entram no mapa — andar
 * entre as linhas vale em toda lista focável.
 */
export type RowFocusAction = "focusNext" | "focusPrev";

/** Letras em minúscula (`"e"`, não `"E"`): a tradução as normaliza. */
export type RowKeyMap<A extends string> = Readonly<Record<string, A>>;

export type RowKeyLike = Pick<KeyboardEvent, "key" | "ctrlKey" | "metaKey" | "altKey" | "repeat">;

const FOCUS_KEYS: RowKeyMap<RowFocusAction> = {
  ArrowDown: "focusNext",
  ArrowUp: "focusPrev",
};

function lookup<A extends string>(map: RowKeyMap<A>, key: string): A | null {
  // Só a propriedade própria, e não `map[key]`: a tecla vem do usuário, e
  // `"constructor"` não pode achar o protótipo do objeto.
  return Object.prototype.hasOwnProperty.call(map, key) ? map[key] : null;
}

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
export function rowKey<A extends string>(
  e: RowKeyLike,
  map: RowKeyMap<A>
): A | RowFocusAction | null {
  if (e.ctrlKey || e.metaKey || e.altKey) return null;
  const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
  const focus = lookup(FOCUS_KEYS, key);
  if (focus) return focus;
  return e.repeat ? null : lookup(map, key);
}

/**
 * O `onKeyDown` pronto de uma linha: traduz pelo mapa e chama o handler da
 * ação. As setas são resolvidas aqui, então `handlers` só cobre o que o mapa
 * declara — e o tipo exige um handler para cada ação dele.
 */
export function rowKeyDownHandler<A extends string>(
  map: RowKeyMap<A>,
  handlers: Record<A, () => void>
) {
  return (e: KeyboardEvent<HTMLElement>) => {
    /* Só a tecla dirigida à **própria** linha. Com o foco num botão dela, o
       Espaço já aciona aquele botão, e agir aqui também faria duas coisas com
       uma tecla. */
    if (e.target !== e.currentTarget) return;
    const action = rowKey(e, map);
    if (!action) return;
    // Contrato nº3: sem isto o Espaço rola a lista e o Enter chega a algum
    // `useSubmitOnEnter` por cima. Tecla fora do mapa segue seu caminho.
    e.preventDefault();
    if (action === "focusNext" || action === "focusPrev") {
      return focusSibling(e.currentTarget, action === "focusNext" ? 1 : -1);
    }
    handlers[action]();
  };
}

/**
 * As setas andam entre linhas **irmãs no DOM** (as do mesmo cartão ou dia); nas
 * pontas não fazem nada. A linha focável é a de `tabIndex=0` — o `TaskRow` só a
 * marca assim quando recebe `onKeyDown`, então o filtro pula modal e qualquer
 * outro irmão que não seja linha.
 */
function focusSibling(row: HTMLElement, step: 1 | -1) {
  const rows = Array.from(
    row.parentElement?.querySelectorAll<HTMLElement>(':scope > [tabindex="0"]') ?? []
  );
  rows[rows.indexOf(row) + step]?.focus();
}
