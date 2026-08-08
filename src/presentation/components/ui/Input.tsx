import { forwardRef } from "react";
import type { InputHTMLAttributes } from "react";
import { controlClass, type ControlSize, type ControlVariant } from "./controlStyles";

/**
 * Campo de texto. Encapsula o vocabulário que estava copiado em ~80 lugares e,
 * junto com ele, duas coisas que escritas à mão divergiam em silêncio: o
 * `autoComplete="off"` que a §8.2 exige (o teste de convenção o cobrava linha a
 * linha; aqui ele passa a vir de graça) e o par `disabled:opacity-50` +
 * `disabled:cursor-not-allowed`, que metade dos campos tinha e metade não.
 *
 * **Caixa e rádio não passam por aqui, e a assinatura os recusa.** Eles não têm
 * casca, fundo nem raio — vesti-los com o de um campo os quebraria. `range` sai
 * pelo mesmo motivo. São controles de outra família; um `Checkbox` canônico, se
 * valer, é trabalho próprio.
 */
type ExcludedType = "checkbox" | "radio" | "range";

interface InputOwnProps {
  variant?: ControlVariant;
  /** Cuidado: `size` é também atributo nativo (nº de caracteres). Aqui vale o
   *  nosso, e o nativo fica indisponível — nenhum call site o usava. */
  size?: ControlSize;
  /** Borda em `danger`. Vale só no `boxed` — ver `controlStyles`. */
  invalid?: boolean;
  type?: Exclude<InputHTMLAttributes<HTMLInputElement>["type"], ExcludedType>;
}

export type InputProps = Omit<InputHTMLAttributes<HTMLInputElement>, "size" | "type"> &
  InputOwnProps;

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  {
    variant = "boxed",
    size = "md",
    invalid = false,
    type = "text",
    autoComplete = "off",
    className = "",
    ...rest
  },
  ref
) {
  return (
    <input
      ref={ref}
      type={type}
      autoComplete={autoComplete}
      className={controlClass(variant, size, invalid, className)}
      {...rest}
    />
  );
});
