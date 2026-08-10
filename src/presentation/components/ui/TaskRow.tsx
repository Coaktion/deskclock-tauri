import type { ReactNode } from "react";
import { BillableChip } from "./BillableChip";

interface TaskRowProps {
  title: string;
  /** Projeto · Categoria, ou o que a tela use como segunda linha. */
  subtitle?: ReactNode;
  /** Bloco à esquerda do nome — a faixa de horário do Histórico. */
  meta?: ReactNode;
  /** Ausente na linha que não mede tempo — a tarefa planejada. */
  duration?: string;
  /** Ausente = a linha não fala de faturamento e não desenha o chip. */
  billable?: boolean;
  /** Ausente = o chip só informa; presente, ele alterna o faturamento. */
  onToggleBillable?: () => void;
  /** Cor do projeto; vem de `getProjectColor`, então é valor, não classe. */
  dotColor?: string;
  /** Caixa de seleção ou seta de expandir. */
  leading?: ReactNode;
  /** Marcas à direita da duração — "enviado", contagem do grupo. */
  badges?: ReactNode;
  /** Só aparecem no hover e no foco do teclado. */
  actions?: ReactNode;
  selected?: boolean;
  onClick?: () => void;
}

export function TaskRow({
  title,
  subtitle,
  meta,
  duration,
  billable,
  onToggleBillable,
  dotColor,
  leading,
  badges,
  actions,
  selected = false,
  onClick,
}: TaskRowProps) {
  return (
    <div
      onClick={onClick}
      className={`group flex items-center gap-2 px-4 py-2.5 rounded-control transition-colors ${
        selected ? "bg-accent/10 hover:bg-accent/15" : "hover:bg-raised"
      } ${onClick ? "cursor-pointer" : ""}`}
    >
      {leading}

      {dotColor && (
        <span
          className="shrink-0 w-2 h-2 rounded-full"
          style={{ backgroundColor: dotColor }}
          aria-hidden
        />
      )}

      {meta && <div className="shrink-0">{meta}</div>}

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 min-w-0">
          <p className="text-sm text-fg truncate">{title}</p>
          {billable !== undefined && (
            <BillableChip billable={billable} onToggle={onToggleBillable} />
          )}
        </div>
        {subtitle && <p className="text-xs text-fg-muted truncate mt-0.5">{subtitle}</p>}
      </div>

      {duration && (
        <span className="shrink-0 text-xs font-mono tabular-nums text-fg-secondary">
          {duration}
        </span>
      )}
      {badges}

      {actions && (
        <div className="flex gap-1 shrink-0 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
          {actions}
        </div>
      )}
    </div>
  );
}
