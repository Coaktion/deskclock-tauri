import type { ReactNode } from "react";
import { TourButton } from "./TourButton";

/**
 * Cabeçalho de página, com altura fixa: é ela que faz a troca de tela pela
 * sidebar não mexer nada abaixo do cabeçalho. Conteúdo que não caiba nos 56 px
 * pertence ao corpo da página.
 */
interface PageHeaderProps {
  /** Ausente em tela cujo cabeçalho é só navegação. */
  title?: string;
  subtitle?: string;
  /** Entra depois do título — a navegação de data, o intervalo da semana. */
  context?: ReactNode;
  tabs?: ReactNode;
  actions?: ReactNode;
  onStartTour?: () => void;
  /** `data-tour` da casca — apontar para dentro destacaria só o título. */
  tourId?: string;
}

export function PageHeader({
  title,
  subtitle,
  context,
  tabs,
  actions,
  onStartTour,
  tourId,
}: PageHeaderProps) {
  return (
    <header
      data-tour={tourId}
      className="shrink-0 h-14 px-4 flex items-center gap-3 border-b border-border-subtle"
    >
      {title && (
        // `shrink-0`: o título é a identidade da tela e não pode ser o que
        // trunca quando o `context` cresce. O teto existe para o subtítulo, que
        // é frase e não caberia inteiro num cabeçalho de altura fixa.
        <div className="shrink-0 max-w-[45%]">
          <h1 className="text-xl font-semibold text-fg truncate">{title}</h1>
          {subtitle && <p className="text-xs text-fg-muted truncate">{subtitle}</p>}
        </div>
      )}
      {context}
      <div className="ml-auto flex items-center gap-2 shrink-0">
        {tabs}
        {actions}
        {onStartTour && <TourButton onClick={onStartTour} />}
      </div>
    </header>
  );
}
