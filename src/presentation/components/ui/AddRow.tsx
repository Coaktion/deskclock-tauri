import { Plus } from "lucide-react";
import type { KeyboardEvent, ReactNode } from "react";

interface AddRowProps {
  /**
   * `useSubmitOnEnter` do painel. Fica no contêiner, e não em cada campo, como
   * manda o contrato de teclado — `keydown` borbulha, e um handler cobre até o
   * campo que a linha ainda não tem.
   */
  onKeyDown?: (e: KeyboardEvent) => void;
  /** Os controles da primeira linha, depois do `+`. */
  children: ReactNode;
  /** Segunda linha: as opções do campo de seleção, o seletor de cor do workspace. */
  extra?: ReactNode;
  className?: string;
}

/**
 * A linha que cadastra, no rodapé das listas de Dados. Ela **é uma linha da
 * lista** e não um bloco solto acima dela (spec `1/1/1/0/1/5` da tela 3c): o
 * tracejado que a separava era a quinta borda de um cartão que já tem casca,
 * cabeçalho e réguas.
 *
 * Fica **fora** da região que rola, presa no rodapé do cartão — no design ela é
 * a última linha de uma lista que cresce sem fim, e ali criar um projeto passaria
 * a custar rolar até o fim do catálogo. Decisão do usuário em 2026-08-14.
 */
export function AddRow({ onKeyDown, children, extra, className = "" }: AddRowProps) {
  return (
    <div onKeyDown={onKeyDown} className={`flex flex-col gap-2 px-3 py-2.5 ${className}`}>
      <div className="flex items-center gap-2">
        <Plus size={14} className="text-fg-muted shrink-0" />
        {children}
      </div>
      {extra}
    </div>
  );
}
