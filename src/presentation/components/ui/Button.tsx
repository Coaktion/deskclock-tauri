import type { ReactNode } from "react";
import { Loader2 } from "lucide-react";

/**
 * Ação com texto. As cinco variantes não são um catálogo: cada uma saiu de um
 * agrupamento medido nos call sites, e o que as separa é a **caixa**, não a cor
 * — foi por não haver primitivo que o mesmo botão secundário nasceu com fundo em
 * `sections/integrations/` e sem fundo no cabeçalho do Histórico.
 *
 * `secondary` e `outline` são exatamente essa divergência, preservada aqui em
 * vez de resolvida: colapsá-las é decisão de design, não de refatoração.
 */
export type ButtonVariant = "primary" | "secondary" | "outline" | "ghost" | "danger";
export type ButtonSize = "sm" | "md";

/**
 * O `border border-transparent` do `primary` não é enfeite: sem ele o botão
 * cheio fica 2px mais baixo que o `secondary` ao lado, e é assim que os dois
 * aparecem no rodapé de todo modal.
 *
 * O `disabled:` mora na variante, não na base, porque as duas famílias o
 * expressam de formas que não se somam: a caixa apaga por opacidade, o texto
 * puro troca de cor. Juntas, apagariam duas vezes.
 */
const VARIANT: Record<ButtonVariant, string> = {
  primary:
    "bg-accent text-white border border-transparent hover:opacity-90 transition disabled:opacity-50",
  secondary:
    "bg-raised text-fg-secondary border border-border hover:border-fg-muted transition-colors disabled:opacity-50",
  outline:
    "bg-transparent text-fg-muted border border-border hover:text-fg hover:border-fg-muted transition-colors disabled:opacity-50",
  ghost: "text-fg-muted hover:text-fg transition-colors disabled:text-fg-muted/50",
  danger: "text-danger hover:opacity-80 transition disabled:text-fg-muted/50 disabled:opacity-100",
};

const SIZE: Record<ButtonSize, string> = {
  sm: "px-2.5 py-1",
  md: "px-3 py-1.5",
};

/** `ghost` e `danger` são texto puro: padding os alargaria dentro das barras de
 *  seleção em que hoje vivem, que alinham por `gap`. */
const BOXED: readonly ButtonVariant[] = ["primary", "secondary", "outline"];

interface ButtonProps {
  children: ReactNode;
  onClick?: () => void;
  /** `button` por padrão — dentro de um `<form>`, a ausência do atributo vira
   *  submit, e são dezenas de botões de alternância que não submetem nada. */
  type?: "button" | "submit";
  variant?: ButtonVariant;
  /** Governa o padding, e por isso vale só nas variantes com caixa. */
  size?: ButtonSize;
  disabled?: boolean;
  /**
   * Troca o ícone pelo spinner e desabilita — o par que todo botão de envio
   * repetia à mão. O rótulo continua sendo de quem chama: "Sincronizando…" e
   * "Aguardando…" dizem coisas diferentes sobre a mesma espera.
   */
  loading?: boolean;
  /** À esquerda do texto, 14px pela escala de ícones (§8.4). */
  icon?: ReactNode;
  title?: string;
  className?: string;
}

export function Button({
  children,
  onClick,
  type = "button",
  variant = "secondary",
  size = "md",
  disabled = false,
  loading = false,
  icon,
  title,
  className = "",
}: ButtonProps) {
  const padding = BOXED.includes(variant) ? SIZE[size] : "";

  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      title={title}
      className={`inline-flex items-center justify-center gap-1.5 text-xs font-medium rounded-control whitespace-nowrap disabled:cursor-not-allowed ${VARIANT[variant]} ${padding} ${className}`}
    >
      {loading ? <Loader2 size={14} className="animate-spin" /> : icon}
      {children}
    </button>
  );
}
