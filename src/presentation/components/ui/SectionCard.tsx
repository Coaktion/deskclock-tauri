import type { ReactNode } from "react";

/**
 * O cartão de hoje no Planejamento (`1/1/1/1/1/1` da tela 3e) é a mesma
 * anatomia com casca, faixa, régua, título e pílula em acento. Mora aqui, e não
 * no call site, porque a faixa escrita duas vezes é como as grafias divergentes
 * desta migração nasceram.
 */
export type SectionCardTone = "default" | "accent";

const TONE: Record<
  SectionCardTone,
  { shell: string; header: string; title: string; count: string }
> = {
  default: {
    shell: "border-border-subtle",
    header: "bg-surface border-border-subtle",
    title: "text-fg-muted",
    count: "bg-border-subtle text-fg-secondary",
  },
  accent: {
    shell: "border-accent/30",
    header: "bg-accent/8 border-accent/25",
    title: "text-accent-text",
    count: "bg-accent/15 text-accent-text",
  },
};

interface SectionCardProps {
  /** Nome do grupo, em overline. Ausente: cartão sem cabeçalho. */
  title?: string;
  /** `accent` marca o cartão do dia corrente. */
  tone?: SectionCardTone;
  /** Quantos itens a lista tem, na pílula ao lado do título. */
  count?: number;
  /** Frase abaixo do título, para o que a lista de dentro não explica sozinha. */
  description?: ReactNode;
  /** Encostado à direita do cabeçalho — o total do dia, um atalho para outra tela. */
  action?: ReactNode;
  /**
   * Linha entre os filhos — o arranjo de lista de configurações. Sem ela, o
   * cartão é uma caixa só, para conteúdo que já tem estrutura própria.
   */
  divided?: boolean;
  className?: string;
  /**
   * Arranjo e respiro do **corpo**. Padding aqui e não em `className`: a casca
   * hospeda a faixa do cabeçalho, que vai de borda a borda — inseri-la num
   * padding deixaria a régua inferior flutuando dentro do cartão.
   */
  bodyClassName?: string;
  children: ReactNode;
}

/**
 * A pílula do contador. É medida do spec (`1/1/1/2/0/1` da tela 3a), e o
 * `tracking-normal` é deliberado: `text-overline` é o único degrau de 10px da
 * escala e carrega `0.1em` junto, que num número só abre um vão à direita.
 */
const COUNT_PILL =
  "shrink-0 rounded-full px-1.5 py-0.5 " +
  "text-overline tracking-normal leading-[1.3] font-mono tabular-nums";

export function SectionCard({
  title,
  tone = "default",
  count,
  description,
  action,
  divided = false,
  className = "",
  bodyClassName = "",
  children,
}: SectionCardProps) {
  const hasHeader = Boolean(title || description || action) || count !== undefined;
  const colors = TONE[tone];

  return (
    <div className={`border ${colors.shell} rounded-card overflow-hidden ${className}`}>
      {hasHeader && (
        <div
          className={`${colors.header} border-b px-3 py-2.5 flex gap-2 ${
            description ? "items-start" : "items-center"
          }`}
        >
          <div className="min-w-0">
            {title && <p className={`text-overline uppercase ${colors.title}`}>{title}</p>}
            {description && (
              <p className="text-xs text-fg-muted mt-1 leading-relaxed">{description}</p>
            )}
          </div>
          {count !== undefined && <span className={`${COUNT_PILL} ${colors.count}`}>{count}</span>}
          {action && <div className="ml-auto shrink-0 text-micro">{action}</div>}
        </div>
      )}
      <div
        className={[divided && "divide-y divide-border-subtle", bodyClassName]
          .filter(Boolean)
          .join(" ")}
      >
        {children}
      </div>
    </div>
  );
}

/** Linha de um `SectionCard` dividido. */
export function SectionRow({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return <div className={`px-4 py-3 ${className}`}>{children}</div>;
}
