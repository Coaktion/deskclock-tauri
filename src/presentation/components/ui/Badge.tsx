import type { ReactNode } from "react";

/**
 * Rótulo curto que **não** responde ao clique: "Billable", "Enviado",
 * "já existe", o nome de uma tag. O que reage ao clique é `FilterPill` (recorte
 * de lista) ou `Button` — e é essa fronteira, e não o desenho, que decide qual
 * dos três usar.
 */
export type BadgeTone = "neutral" | "billable" | "success" | "accent" | "warning" | "danger";

/**
 * `billable` e `success` compartilham o verde e mesmo assim são tons separados:
 * "faturável" e "deu certo" coincidem hoje na cor, não no significado, e um
 * `success` escrito como `billable` some no dia em que os dois divergirem.
 */
const TONE: Record<BadgeTone, string> = {
  neutral: "bg-raised border-border text-fg-muted",
  billable: "bg-billable/10 border-billable/30 text-billable",
  success: "bg-success/10 border-success/30 text-success",
  accent: "bg-accent/10 border-accent/30 text-accent-text",
  warning: "bg-warning/10 border-warning/30 text-warning",
  danger: "bg-danger/10 border-danger/30 text-danger",
};

interface BadgeProps {
  tone?: BadgeTone;
  /** Vem antes do texto, e nunca no lugar dele — cor e ícone não são legenda. */
  icon?: ReactNode;
  children: ReactNode;
  title?: string;
  className?: string;
}

/**
 * A caixa é medida do spec (`1/1/1/2/1/2` da tela 3a): pílula de 10px em peso
 * 500, padding 2/6. **O gap de 4 vem da 3c** (`1/1/1/0/1/1/3`), porque a 3a não
 * desenha badge com ícone e por isso não declara gap nenhum.
 * O `tracking-normal` e o `leading-[1.4]` são deliberados —
 * `text-overline` é o único degrau de 10px da escala e carrega `0.1em` e peso
 * 600 junto, e sem a entrelinha declarada a altura do chip dependeria do que ele
 * herda da linha em volta.
 */
export function Badge({ tone = "neutral", icon, children, title, className = "" }: BadgeProps) {
  return (
    <span
      title={title}
      className={`inline-flex items-center gap-1 shrink-0 whitespace-nowrap px-1.5 py-0.5 border rounded-full text-overline tracking-normal font-medium leading-[1.4] ${TONE[tone]} ${className}`}
    >
      {icon}
      {children}
    </span>
  );
}
