import { useRef } from "react";
import { MoreHorizontal } from "lucide-react";
import { ClickBoundary } from "./ClickBoundary";
import { IconButton } from "./IconButton";

/** O pedaço do `useRowMenu` de que o gatilho precisa — o hook inteiro serve. */
interface RowMenuState {
  fromTrigger: boolean;
  toggleFrom: (trigger: HTMLElement | null) => void;
}

interface RowMenuTriggerProps {
  menu: RowMenuState;
}

/**
 * O ⋯ de uma linha de lista, par do `useRowMenu`. Guarda o próprio `ref`, que é
 * a âncora do menu, e mora num `ClickBoundary` porque a linha em volta edita ao
 * clique. Diz-se pressionado só quando foi **ele** que abriu o menu — aberto
 * pelo clique direito, o menu está no ponto do cursor, não aqui.
 */
export function RowMenuTrigger({ menu }: RowMenuTriggerProps) {
  const ref = useRef<HTMLSpanElement>(null);
  return (
    <ClickBoundary ref={ref}>
      <IconButton
        icon={<MoreHorizontal size={14} />}
        title="Mais ações"
        size="sm"
        pressed={menu.fromTrigger}
        onClick={() => menu.toggleFrom(ref.current)}
      />
    </ClickBoundary>
  );
}
