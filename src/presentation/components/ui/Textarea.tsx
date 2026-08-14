import { forwardRef } from "react";
import type { TextareaHTMLAttributes } from "react";
import { controlClass, type ControlSize, type ControlVariant } from "./controlStyles";

/**
 * Texto de várias linhas — a importação em massa, o campo personalizado
 * `multiline`. Mesma casca do `Input`, e é esse o ponto de existir aqui em vez
 * de cada tela vestir um `<textarea>` com as classes do campo de uma linha.
 *
 * `resize-y` é o padrão: horizontal escaparia da coluna do formulário, e travar
 * os dois lados tira do usuário a única saída para um texto longo. Quem precisa
 * de outra coisa passa `resize-none` pelo `className`.
 */
interface TextareaOwnProps {
  variant?: ControlVariant;
  /** Ver `Input`: encobre o atributo nativo de mesmo nome. */
  size?: ControlSize;
  invalid?: boolean;
}

export type TextareaProps = Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, "size"> &
  TextareaOwnProps;

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
  { variant = "boxed", size = "md", invalid = false, className = "", ...rest },
  ref
) {
  return (
    <textarea
      ref={ref}
      className={controlClass(variant, size, invalid, `resize-y ${className}`)}
      {...rest}
    />
  );
});
