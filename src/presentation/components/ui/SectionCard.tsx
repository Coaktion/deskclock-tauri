import type { ReactNode } from "react";

interface SectionCardProps {
  /** Nome do grupo, em overline. Ausente: cartão sem cabeçalho. */
  title?: string;
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
  "shrink-0 rounded-full bg-border-subtle px-1.5 py-0.5 " +
  "text-overline tracking-normal leading-[1.3] font-mono tabular-nums text-fg-secondary";

export function SectionCard({
  title,
  count,
  description,
  action,
  divided = false,
  className = "",
  bodyClassName = "",
  children,
}: SectionCardProps) {
  const hasHeader = Boolean(title || description || action) || count !== undefined;

  return (
    <div className={`border border-border-subtle rounded-card overflow-hidden ${className}`}>
      {hasHeader && (
        <div
          className={`bg-surface border-b border-border-subtle px-3 py-2.5 flex gap-2 ${
            description ? "items-start" : "items-center"
          }`}
        >
          <div className="min-w-0">
            {title && <p className="text-overline uppercase text-fg-muted">{title}</p>}
            {description && (
              <p className="text-xs text-fg-muted mt-1 leading-relaxed">{description}</p>
            )}
          </div>
          {count !== undefined && <span className={COUNT_PILL}>{count}</span>}
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
