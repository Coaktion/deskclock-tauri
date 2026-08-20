import type { ReactNode } from "react";
import { BillableChip } from "./BillableChip";

/**
 * Faturamento é **par**, nunca prop solta: a linha que o informa é a linha que o
 * altera. Como união e não como dois opcionais porque só a união recusa em
 * compilação a linha que desenha o chip mudo — que foi o que quatro telas
 * fizeram enquanto `onToggleBillable` era opcional.
 */
type BillableProps =
  /** A linha não fala de faturamento e não desenha o chip. */
  | { billable?: undefined; onToggleBillable?: undefined }
  | { billable: boolean; onToggleBillable: () => void };

interface TaskRowBaseProps {
  title: string;
  /**
   * Marcas que ficam **ao lado** do nome e não podem ser cortadas com ele —
   * recorrência, sino do rastreio. Fora do `<p>` de propósito: o nome trunca, e
   * dentro dele o glifo seria o primeiro a sumir num nome longo.
   */
  titleMarks?: ReactNode;
  /** Riscado e apagado — a planejada já concluída no dia. */
  completed?: boolean;
  /** Projeto · Categoria, ou o que a tela use como segunda linha. */
  subtitle?: ReactNode;
  /** A coluna de 88px — faixa de horário, contagem de registros do grupo. */
  meta?: ReactNode;
  /** Ausente na linha que não mede tempo — a tarefa planejada. */
  duration?: string;
  /** Cor do projeto; vem de `getProjectColor`, então é valor, não classe. */
  dotColor?: string;
  /** Caixa de seleção ou seta de expandir. Vazio reserva a coluna. */
  leading?: ReactNode;
  /** Marcas ao lado do chip — "enviado", envio parcial. */
  badges?: ReactNode;
  /** Dividem a última coluna com a duração: ela recua, elas aparecem. */
  actions?: ReactNode;
  /**
   * Sem duração para recuar, a célula das ações fecha em **largura** até o
   * hover, em vez de ficar sempre aberta. É o que a linha planejada do
   * Planejamento pede: com cinco botões, a coluna reservada sai do `1fr` do
   * nome, que trunca numa linha vazia à direita (§5.3). Onde a ação é uma só —
   * o ▶ das planejadas de hoje —, ela continua sempre visível (§7.5.3).
   *
   * A célula que cresce passa **à frente** do chip quando isto está ligado; o
   * porquê está na ordem das colunas, mais abaixo.
   */
  collapseActions?: boolean;
  /**
   * A linha pende da de cima — a tarefa dentro de um grupo aberto. Ela ganha o
   * trilho e um degrau de 12px à esquerda; o degrau sai do `1fr` do nome, então
   * chip e duração continuam onde estão nas linhas em volta.
   */
  nested?: boolean;
  selected?: boolean;
  onClick?: () => void;
}

type TaskRowProps = TaskRowBaseProps & BillableProps;

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

export function TaskRow(props: TaskRowProps) {
  const {
    title,
    titleMarks,
    completed = false,
    subtitle,
    meta,
    duration,
    dotColor,
    leading,
    badges,
    actions,
    collapseActions = false,
    nested = false,
    selected = false,
    onClick,
  } = props;

  /**
   * O par de faturamento sai de `props`, e não do destructuring acima, porque é
   * só no objeto que a união se estreita: desmembrado, o `billable` deixa de
   * carregar consigo a garantia de que o `onToggleBillable` veio junto.
   */
  const billableChip =
    props.billable === undefined ? null : (
      <BillableChip billable={props.billable} onToggle={props.onToggleBillable} />
    );

  const hasLeading = Boolean(leading);
  const hasMeta = Boolean(meta);

  /**
   * Fechar em **largura** é o que a linha sem duração faz; com duração, quem
   * some é a opacidade dentro de uma célula que já está reservada. A leitura
   * mora aqui e não em duas condições soltas porque a ordem das colunas depende
   * dela: separadas, a linha que pedisse `collapseActions` **com** duração
   * ficaria com a ordem de uma e o comportamento da outra.
   */
  const collapsesWidth = collapseActions && !duration;

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

  const name = (
    <p className={`text-sm truncate ${completed ? "line-through text-fg-muted" : "text-fg"}`}>
      {title}
    </p>
  );

  const nameBlock = (
    <div className="min-w-0">
      {titleMarks ? (
        <div className="min-w-0 flex items-center gap-1.5">
          {name}
          {titleMarks}
        </div>
      ) : (
        name
      )}
      {subtitle && <p className="text-xs text-fg-muted truncate mt-px">{subtitle}</p>}
    </div>
  );

  const billableCell = (
    <div className="flex items-center gap-2">
      {badges}
      {billableChip}
    </div>
  );

  /*
   * Duração e ações ocupam a **mesma** célula, empilhadas: a duração recua no
   * hover e as ações tomam o lugar dela. Empilhar em vez de trocar por `hidden`
   * guarda duas coisas — a largura da célula não pula quando o cursor entra, e o
   * botão continua alcançável pelo teclado, que é o que `display:none` tiraria.
   * Sem duração (a planejada), a ação fica sempre visível: é a decisão §7.5.3 do
   * handoff — a menos que `collapseActions` peça o contrário, e aí quem some é a
   * **largura**, que é o que a coluna de cinco botões cobraria do nome.
   *
   * Fechada em largura, a célula **ainda consome um `gap` da grade**: sem o
   * `-mr-2.5` o chip nasceria 10px à direita de onde está hoje. A margem negativa
   * cancela exatamente esse gap em repouso e o devolve no hover, quando ele passa
   * a ser o respiro entre o último botão e o chip.
   */
  const trailingCell = (
    <div
      className={`grid items-center justify-items-end ${
        collapsesWidth ? "-mr-2.5 group-hover:mr-0 group-focus-within:mr-0" : ""
      }`}
    >
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
              : collapsesWidth
                ? "w-0 overflow-hidden opacity-0 transition-opacity group-hover:w-auto group-hover:opacity-100 group-focus-within:w-auto group-focus-within:opacity-100"
                : ""
          }`}
        >
          {actions}
        </div>
      )}
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

      {/*
       * **O que cresce nunca fica entre o `1fr` e o chip.** Quem paga a largura
       * que a célula das ações abre é sempre o nome, e tudo o que estiver à
       * direita dele é puxado junto: com o chip antes das ações, ele andava
       * ~118px para a esquerda no instante em que o cursor entrava na linha, e
       * quem ocupava o lugar dele era o último botão da fileira — o "Excluir",
       * que aqui não pergunta. Ancorado por último, o chip fica imóvel, e o único
       * que encolhe é o nome, que não é alvo de clique.
       *
       * Vale só onde a célula fecha em largura: com duração ela já está
       * reservada, nada se move, e ali o chip continua antes — que é o que o
       * design desenha nas Entradas.
       */}
      {collapsesWidth ? (
        <>
          {trailingCell}
          {billableCell}
        </>
      ) : (
        <>
          {billableCell}
          {trailingCell}
        </>
      )}

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
