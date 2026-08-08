import type { ReactNode } from "react";

interface SectionCardProps {
  /** Nome do grupo, em overline. Ausente: cartão sem cabeçalho. */
  title?: string;
  /** Frase abaixo do título, para o que a lista de dentro não explica sozinha. */
  description?: ReactNode;
  /** Encostado à direita do título — o total do dia, um atalho para outra tela. */
  action?: ReactNode;
  /**
   * Linha entre os filhos — o arranjo de lista de configurações. Sem ela, o
   * cartão é uma caixa só, para conteúdo que já tem estrutura própria.
   */
  divided?: boolean;
  className?: string;
  children: ReactNode;
}

export function SectionCard({
  title,
  description,
  action,
  divided = false,
  className = "",
  children,
}: SectionCardProps) {
  return (
    <div className={`bg-surface border border-border-subtle rounded-card ${className}`}>
      {(title || description || action) && (
        <div className="px-4 pt-3 pb-2 flex items-start justify-between gap-3">
          <div className="min-w-0">
            {title && <p className="text-overline uppercase text-fg-muted">{title}</p>}
            {description && (
              <p className="text-xs text-fg-muted mt-1 leading-relaxed">{description}</p>
            )}
          </div>
          {action && <div className="shrink-0">{action}</div>}
        </div>
      )}
      <div className={divided ? "divide-y divide-border-subtle" : ""}>{children}</div>
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
