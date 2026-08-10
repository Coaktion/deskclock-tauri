import type { ReactNode } from "react";
import { BillableChip } from "./BillableChip";

interface TaskRowProps {
  title: string;
  /** Projeto · Categoria, ou o que a tela use como segunda linha. */
  subtitle?: ReactNode;
  /** A coluna de 88px — faixa de horário, contagem de registros do grupo. */
  meta?: ReactNode;
  /** Ausente na linha que não mede tempo — a tarefa planejada. */
  duration?: string;
  /** Ausente = a linha não fala de faturamento e não desenha o chip. */
  billable?: boolean;
  /** Ausente = o chip só informa; presente, ele alterna o faturamento. */
  onToggleBillable?: () => void;
  /** Cor do projeto; vem de `getProjectColor`, então é valor, não classe. */
  dotColor?: string;
  /** Caixa de seleção ou seta de expandir. Vazio reserva a coluna. */
  leading?: ReactNode;
  /** Marcas ao lado do chip — "enviado", envio parcial. */
  badges?: ReactNode;
  /** Dividem a última coluna com a duração: ela recua, elas aparecem. */
  actions?: ReactNode;
  selected?: boolean;
  onClick?: () => void;
}

/**
 * As formas de grade do censo do design (§7.2 do handoff): a coluna de 88px
 * carrega a faixa de horário ou a contagem do grupo, o `1fr` é o nome, e os dois
 * `auto` finais são o chip e o par duração↔ações.
 *
 * São quatro literais e não uma string montada porque **o Tailwind lê a classe
 * no código-fonte**: `grid-cols-[${...}]` não gera utilitário nenhum, e a linha
 * cairia para o `display:grid` sem colunas — que é flex mal desenhado.
 */
function gridColumns(hasLeading: boolean, hasMeta: boolean, hasDot: boolean): string {
  if (hasLeading && hasMeta) return "grid-cols-[auto_88px_1fr_auto_auto]";
  if (hasMeta) return "grid-cols-[88px_1fr_auto_auto]";
  if (hasLeading || hasDot) return "grid-cols-[auto_1fr_auto_auto]";
  return "grid-cols-[1fr_auto_auto]";
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
  const hasLeading = Boolean(leading);
  const hasMeta = Boolean(meta);

  /**
   * O ponto abre coluna própria só quando **nada o precede**. Com o chevron ou a
   * faixa de horário à frente, ele entra no bloco do nome — é o que o design
   * desenha nas três formas, e é o que mantém o nome começando no mesmo lugar
   * em linhas que têm ou não têm o ponto.
   */
  const dotInName = Boolean(dotColor) && (hasLeading || hasMeta);
  const dot = dotColor && (
    <span
      className="shrink-0 w-1.5 h-1.5 rounded-full"
      style={{ backgroundColor: dotColor }}
      aria-hidden
    />
  );

  const nameBlock = (
    <div className="min-w-0">
      <p className="text-sm text-fg truncate">{title}</p>
      {subtitle && <p className="text-xs text-fg-muted truncate mt-px">{subtitle}</p>}
    </div>
  );

  return (
    <div
      onClick={onClick}
      className={`group grid items-center ${gridColumns(hasLeading, hasMeta, Boolean(dotColor))} gap-2.5 px-3 py-2.5 border-b border-border-subtle last:border-b-0 transition-colors ${
        selected ? "bg-accent/10 hover:bg-accent/15" : "hover:bg-surface"
      } ${onClick ? "cursor-pointer" : ""}`}
    >
      {hasLeading && leading}
      {hasMeta && meta}
      {!dotInName && dot}

      {dotInName ? (
        <div className="min-w-0 flex items-center gap-2">
          {dot}
          {nameBlock}
        </div>
      ) : (
        nameBlock
      )}

      <div className="flex items-center gap-2">
        {badges}
        {billable !== undefined && <BillableChip billable={billable} onToggle={onToggleBillable} />}
      </div>

      {/*
       * Duração e ações ocupam a **mesma** célula, empilhadas: a duração recua no
       * hover e as ações tomam o lugar dela. Empilhar em vez de trocar por
       * `hidden` guarda duas coisas — a largura da célula não pula quando o
       * cursor entra, e o botão continua alcançável pelo teclado, que é o que
       * `display:none` tiraria. Sem duração (a planejada), a ação fica sempre
       * visível: é a decisão §7.5.3 do handoff.
       */}
      <div className="grid items-center justify-items-end">
        {duration && (
          <span
            className={`col-start-1 row-start-1 text-sm font-mono tabular-nums text-fg-secondary ${
              actions ? "transition-opacity group-hover:opacity-0 group-focus-within:opacity-0" : ""
            }`}
          >
            {duration}
          </span>
        )}
        {actions && (
          <div
            className={`col-start-1 row-start-1 flex gap-0.5 ${
              duration
                ? "opacity-0 pointer-events-none transition-opacity group-hover:opacity-100 group-hover:pointer-events-auto group-focus-within:opacity-100 group-focus-within:pointer-events-auto"
                : ""
            }`}
          >
            {actions}
          </div>
        )}
      </div>
    </div>
  );
}
