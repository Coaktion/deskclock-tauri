import type { MouseEvent } from "react";

/**
 * O nome que não cabe na linha ganha o texto inteiro como dica nativa — e só
 * ele. A dica é escrita **no `mouseenter`**, no instante em que ela pode
 * aparecer, e não a cada render: é ali que `scrollWidth` e `clientWidth` já
 * valem o que a tela mostra, e é o que dispensa `ResizeObserver` e estado por
 * linha numa lista que pode ter dezenas delas.
 *
 * Escrever a dica **em toda** linha seria pior que não ter nenhuma: o balão
 * apareceria sobre nomes que já estão inteiros na tela, e o usuário aprenderia
 * a ignorá-lo justamente no nome longo, que é o único caso que importa.
 *
 * O texto sai do `textContent` do próprio elemento, não de uma prop: assim o
 * mesmo handler serve ao nome, ao subtítulo e ao botão do popup sem que
 * nenhum deles precise repetir a string que já está escrita no JSX.
 *
 * `fallback` é para o elemento que **já** tem dica própria — o botão do nome no
 * popup, que diz "Editar tarefa". Sem ele, a dica de ação some assim que o nome
 * passa a caber.
 */
export function titleWhenTruncated(fallback?: string) {
  return (e: MouseEvent<HTMLElement>) => {
    const el = e.currentTarget;
    if (el.scrollWidth > el.clientWidth) el.title = el.textContent ?? "";
    else if (fallback) el.title = fallback;
    else el.removeAttribute("title");
  };
}
