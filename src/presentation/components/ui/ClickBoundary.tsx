import { forwardRef, type ReactNode } from "react";

/**
 * Invólucro de um controle que mora dentro de uma linha clicável: o clique nele
 * **não** chega à linha. Existe porque o `IconButton` e o `FilterPill` não
 * repassam o evento ao `onClick` nem expõem `ref` — e o gatilho de um painel
 * ancorado precisa das duas coisas. Estava escrito à mão três vezes (o ⋯ e o ▶
 * da linha planejada, o ⚡).
 *
 * O `ref` é o do invólucro, e é ele que serve de âncora; para devolver o foco, o
 * `Menu` procura o focável de dentro.
 */
export const ClickBoundary = forwardRef<HTMLSpanElement, { children: ReactNode }>(
  function ClickBoundary({ children }, ref) {
    return (
      <span ref={ref} className="inline-flex" onClick={(e) => e.stopPropagation()}>
        {children}
      </span>
    );
  }
);
