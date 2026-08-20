import { fieldLabelClass } from "@presentation/components/fieldStyles";
import type { ReactNode } from "react";

/**
 * Campo de formulário: **rótulo em overline acima da caixa**, na medida do spec
 * extraído (tela 3e — 10px/600, `0.1em`, gap 4 até a caixa). O controle vai como
 * filho, sem casca própria — quem desenha fundo, borda e raio é a caixa, e é por
 * isso que o campo lê como uma coisa só quando divide a linha com um botão ou
 * com um texto auxiliar. O controle é um `<Input variant="bare">` (ou
 * `Select`/`Textarea` no mesmo variante).
 *
 * **O rótulo era encaixado na borda**, e o app tinha mais três grafias para a
 * mesma coisa: o mesmo entalhe escrito em classes, o rótulo flutuante dos campos
 * personalizados e o `<label>` solto em `body/ui`. As quatro colapsaram aqui.
 * Com o entalhe foram junto as compensações que ele espalhava por call site — o
 * `mt-1.5` no fluxo (para o rótulo caber acima da borda) e o `pt-3` em **todo**
 * controle de dentro (para o texto não subir sobre o rótulo).
 */
interface FieldProps {
  label: string;
  /** Sem ele, o clique no rótulo não foca o campo. */
  htmlFor?: string;
  children: ReactNode;
  /** Classes do bloco inteiro — largura e lugar na linha (`flex-1`, `w-32`). */
  className?: string;
  /**
   * Classes da **caixa**: o arranjo de quem divide a linha com o controle
   * (`flex items-center pr-2`) e a borda de erro. Separado do `className` pelo
   * mesmo motivo que o `bodyClassName` do `Modal` — na caixa, o `flex-1` não
   * chegaria à linha; no bloco, o `items-center` não chegaria à caixa.
   */
  boxClassName?: string;
}

export function Field({ label, htmlFor, children, className = "", boxClassName = "" }: FieldProps) {
  return (
    <div className={`flex flex-col gap-1 ${className}`}>
      <label htmlFor={htmlFor} className={fieldLabelClass}>
        {label}
      </label>
      <div
        className={`bg-raised border border-border rounded-control focus-within:border-accent transition-colors ${boxClassName}`}
      >
        {children}
      </div>
    </div>
  );
}
