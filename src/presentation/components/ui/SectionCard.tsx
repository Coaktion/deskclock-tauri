import type { ReactNode } from "react";

interface SectionCardProps {
  /** Nome do grupo, em overline. Ausente: cartão sem cabeçalho. */
  title?: string;
  /** Frase abaixo do título, para o que a lista de dentro não explica sozinha. */
  description?: ReactNode;
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
  divided = false,
  className = "",
  children,
}: SectionCardProps) {
  return (
    <div className={`bg-surface border border-border-subtle rounded-card ${className}`}>
      {(title || description) && (
        <div className="px-4 pt-3 pb-2">
          {title && (
            <p className="text-[10px] font-semibold uppercase tracking-widest text-fg-muted">
              {title}
            </p>
          )}
          {description && (
            <p className="text-xs text-fg-muted mt-1 leading-relaxed">{description}</p>
          )}
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
