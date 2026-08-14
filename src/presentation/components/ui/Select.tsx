import { forwardRef } from "react";
import type { ReactNode, SelectHTMLAttributes } from "react";
import { ChevronDown } from "lucide-react";
import { controlClass, type ControlSize, type ControlVariant } from "./controlStyles";

/**
 * Escolha em lista nativa, com a seta desenhada por nós.
 *
 * **É este componente que tira o cinza fixo do `index.css`.** A seta era uma
 * regra global (`select { appearance: none; background-image: url(…) }`) com o
 * traço em `#6b7280` cravado dentro de um data-URI: cinza que parece certo no
 * escuro e ignora modo e acento, e que nenhum token alcança — variável CSS não
 * atravessa a fronteira de um data-URI. Como ícone Lucide ela lê `text-fg-muted`
 * como qualquer outro glifo, e entra na escala de 14 px (§8.4).
 *
 * Sobra na folha global só o `color-scheme`, que governa a pintura do popup
 * **nativo** — comportamento de plataforma, não cromo nosso.
 *
 * **`className` vai no invólucro**, não no `<select>`: é ele que ocupa o lugar
 * na linha (`w-full`, `shrink-0`, `max-w-[180px]`), enquanto o campo por dentro
 * é sempre `w-full`. Dado ao campo, a largura não chegaria ao invólucro e a
 * seta ficaria pendurada fora dele.
 */
interface SelectOwnProps {
  children: ReactNode;
  variant?: ControlVariant;
  /** Ver `Input`: encobre o atributo nativo de mesmo nome, que ninguém usava. */
  size?: ControlSize;
  invalid?: boolean;
  /** Classes do **invólucro** — largura e posição na linha. */
  className?: string;
}

export type SelectProps = Omit<
  SelectHTMLAttributes<HTMLSelectElement>,
  "size" | "className" | "children"
> &
  SelectOwnProps;

export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { children, variant = "boxed", size = "md", invalid = false, className = "", ...rest },
  ref
) {
  return (
    <span className={`relative inline-block ${className}`}>
      <select
        ref={ref}
        // `appearance-none` some com a seta do sistema; o `pr-7` abre o espaço
        // em que a nossa entra. Sem os dois, as duas aparecem lado a lado.
        className={controlClass(variant, size, invalid, "appearance-none pr-7 cursor-pointer")}
        {...rest}
      >
        {children}
      </select>
      <ChevronDown
        size={14}
        aria-hidden
        className="absolute right-2 top-1/2 -translate-y-1/2 text-fg-muted pointer-events-none"
      />
    </span>
  );
});
