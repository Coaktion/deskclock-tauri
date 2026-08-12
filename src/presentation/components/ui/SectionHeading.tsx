import type { ReactNode } from "react";

interface SectionHeadingProps {
  children: ReactNode;
}

/**
 * O rótulo que separa dois trechos de uma **mesma** lista — "Com hora de
 * início" e "Sem hora definida" no popup, o total do dia acima das executadas.
 *
 * Não é o cabeçalho do `SectionCard`: aquele é a faixa que abre um cartão, com
 * fundo, borda e contador. Este é só o degrau `overline` sobre a régua que já
 * existe, e é o que o mantém legível em 288px, onde uma segunda faixa por grupo
 * comeria a lista que ela anuncia.
 */
export function SectionHeading({ children }: SectionHeadingProps) {
  return (
    <div className="px-3 pt-2.5 pb-1 text-overline uppercase text-fg-muted select-none">
      {children}
    </div>
  );
}
