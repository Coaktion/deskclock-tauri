import type { ReactNode } from "react";
import { Loader2 } from "lucide-react";

/**
 * Ação com texto. As variantes não são um catálogo: cada uma saiu de um
 * agrupamento medido nos call sites.
 *
 * **Existiu uma `outline`** — só borda, sem fundo —, que era o mesmo botão
 * secundário escrito de outro jeito no cabeçalho do Histórico. Ela foi colapsada
 * em `secondary` por decisão do usuário: um botão secundário só, com fundo
 * `raised`. Voltar a distinguir os dois exige o documento de design, não o
 * contrário.
 *
 * `accent` é o degrau entre `primary` e `secondary` — a ação que convida sem
 * disputar com a principal ("Buscar" do Histórico) e o estado ligado de um
 * botão de alternância ("Filtros"). A ação do cabeçalho de página é
 * `secondary`, como o design a desenha em Dados e em Configurações.
 */
export type ButtonVariant = "primary" | "accent" | "secondary" | "ghost" | "danger";
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
  accent:
    "bg-accent/10 text-accent-text border border-accent/30 hover:bg-accent/20 hover:border-accent/50 transition-colors disabled:opacity-50",
  secondary:
    "bg-raised text-fg-secondary border border-border hover:border-fg-muted transition-colors disabled:opacity-50",
  ghost: "text-fg-muted hover:text-fg transition-colors disabled:text-fg-muted/50",
  danger: "text-danger hover:opacity-80 transition disabled:text-fg-muted/50 disabled:opacity-100",
};

const SIZE: Record<ButtonSize, string> = {
  sm: "px-2.5 py-1",
  md: "px-3 py-1.5",
};

/** `ghost` e `danger` são texto puro: padding os alargaria dentro das barras de
 *  seleção em que hoje vivem, que alinham por `gap`. */
const BOXED: readonly ButtonVariant[] = ["primary", "accent", "secondary"];

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
  /**
   * Botão que abre e fecha um bloco. Vira `aria-expanded`, que é o que faz o
   * leitor de tela anunciar o estado — o chevron só o diz a quem enxerga.
   */
  expanded?: boolean;
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
  expanded,
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
      aria-expanded={expanded}
      title={title}
      className={`inline-flex items-center justify-center gap-1.5 text-sm font-medium rounded-control whitespace-nowrap disabled:cursor-not-allowed ${VARIANT[variant]} ${padding} ${className}`}
    >
      {loading ? <Loader2 size={14} className="animate-spin" /> : icon}
      {children}
    </button>
  );
}
