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
  /**
   * A linha pende da de cima — a tarefa dentro de um grupo aberto. Ela ganha o
   * trilho e um degrau de 12px à esquerda; o degrau sai do `1fr` do nome, então
   * chip e duração continuam onde estão nas linhas em volta.
   */
  nested?: boolean;
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

/**
 * As duas parcelas de que o trilho da linha aninhada depende, e o único lugar em
 * que a conta existe: ele desce pelo **meio** do chevron do grupo, então o x
 * dele é `padding horizontal da linha + metade da coluna do chevron`.
 *
 * Elas moram juntas porque governam três coisas que **têm de concordar** — o
 * padding da linha, a largura reservada da coluna que abre o grupo (mesmo
 * vazia) e o x do trilho. Mexer numa move as outras. O que a classe do Tailwind
 * não deixa derivar — `pl-3` e `pl-6` são literais, o utilitário não lê variável
 * — é `TaskRow.test.tsx` que amarra: ele afirma a conta contra o que as classes
 * de padding **realmente rendem**, e reprova se uma delas mudar sozinha.
 */
const PADDING_X = 12;
const LEADING_WIDTH = 14;
const RAIL_LEFT = PADDING_X + LEADING_WIDTH / 2;

/** `pl-6` é o dobro de `pl-3`: o degrau da filha é um padding a mais. */
const PADDING_LEFT = { row: "pl-3", nested: "pl-6" } as const;

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
  nested = false,
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
      className={`group grid items-center ${gridColumns(hasLeading, hasMeta, Boolean(dotColor))} gap-2.5 py-2.5 pr-3 border-b border-border-subtle last:border-b-0 transition-colors ${
        nested ? `relative ${PADDING_LEFT.nested}` : PADDING_LEFT.row
      } ${selected ? "bg-accent/10 hover:bg-accent/15" : "hover:bg-surface"} ${
        onClick ? "cursor-pointer" : ""
      }`}
    >
      {/*
       * A coluna que abre o grupo, reservada pelo primitivo **mesmo vazia**: sem
       * largura ela mede 0, e aí a faixa de horário da filha sobe 14px à
       * esquerda da faixa do grupo — que é o que o wireframe faz, medido, e é
       * desalinhamento e não recuo. O call site diz só que a coluna existe.
       */}
      {hasLeading && (
        <span
          className="flex items-center justify-center"
          style={{ width: LEADING_WIDTH }}
          data-leading
        >
          {leading}
        </span>
      )}
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
              actions
                ? "pointer-events-none transition-opacity group-hover:opacity-0 group-focus-within:opacity-0"
                : ""
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

      {/*
       * O trilho, no eixo do chevron de que ele desce (ver `RAIL_LEFT`). Fora do
       * fluxo de propósito: em fluxo ele seria mais uma célula, e a grade tem uma
       * coluna por célula. Sem raio e de topo a base, para que filhas em
       * sequência formem um filete só. Vem por último no DOM porque o ponto de
       * projeto é o primeiro `aria-hidden` da linha, e há quem o procure assim.
       */}
      {nested && (
        <span
          className="absolute top-0 bottom-0 w-0.5 bg-border-subtle"
          style={{ left: RAIL_LEFT }}
          aria-hidden
        />
      )}
    </div>
  );
}
