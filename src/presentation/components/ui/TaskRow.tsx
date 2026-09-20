import type { KeyboardEvent, MouseEvent, ReactNode } from "react";
import { BillableChip } from "./BillableChip";
import { ExecutionDot, type RowExecution } from "./ExecutionDot";

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
  /**
   * O ⋯ da linha, em **coluna própria e sempre visível**, a primeira da direita
   * (H2 do spec `acoes-da-linha-planejada.md`). Ele não se empilha mais sobre a
   * duração nem some no repouso: empilhado, apagava o tempo do Histórico e das
   * entradas de hoje no instante em que o cursor entrava na linha; em primeiro
   * lugar, ele fica no mesmo x em toda linha, tenha ela chip ou não.
   */
  actions?: ReactNode;
  /**
   * Coluna sempre visível **depois** do chip de faturamento, a última da linha —
   * a casa do ▶ da planejada. Só existe quando a prop vem: sem ela a grade é a de
   * sempre, e os call sites que não a usam não mudam em nada.
   *
   * Reservá-la **vazia** é trabalho do chamador. A linha que não tem o que pôr ali
   * (a concluída, o modo de seleção), mas vive numa lista em que as vizinhas têm,
   * passa um elemento de largura fixa do tamanho do conteúdo — ou o chip das
   * vizinhas saltaria a largura da coluna a cada linha que a perde.
   */
  trailing?: ReactNode;
  /**
   * A linha pende da de cima — a tarefa dentro de um grupo aberto. Ela ganha o
   * trilho e um degrau de 12px à esquerda; o degrau sai do `1fr` do nome, então
   * chip e duração continuam onde estão nas linhas em volta.
   */
  nested?: boolean;
  /**
   * A linha **é** a execução em curso, e em que estado. Ausente, a linha é a de
   * sempre — é isso que mantém intocados os call sites que não realçam nada.
   *
   * A união mora ao lado do `ExecutionDot`, em `components/ui/`, e não em
   * `components/playAction`: quem a deriva é a tela, e o primitivo não pode
   * depender de um módulo de tela para saber desenhar o próprio ponto.
   */
  execution?: RowExecution;
  selected?: boolean;
  onClick?: () => void;
  /** Repassado ao contêiner da linha — o menu no ponto do clique direito. */
  onContextMenu?: (e: MouseEvent) => void;
  /**
   * Presente, a linha vira parada de Tab (`tabIndex=0`) e ganha anel de foco no
   * `focus-visible`. Ausente, ela não é focável — é isso que deixa intocadas as
   * telas que não operam a linha pelo teclado.
   */
  onKeyDown?: (e: KeyboardEvent<HTMLDivElement>) => void;
}

type TaskRowProps = TaskRowBaseProps & BillableProps;

/**
 * As formas de grade do censo do design (§7.2 do handoff): a coluna de 88px
 * carrega a faixa de horário ou a contagem do grupo, o `1fr` é o nome, e os dois
 * `auto` finais são o ⋯ e a célula de dados (marcas, chip e duração).
 *
 * **A contagem de colunas não depende do conteúdo.** As duas células da direita
 * são sempre emitidas, mesmo vazias, e por isso as formas abaixo continuam
 * sendo as mesmas quatro do censo — a H2 trocou a **ordem** delas, não o número.
 *
 * São literais e não uma string montada porque **o Tailwind lê a classe no
 * código-fonte**: `grid-cols-[${...}]` não gera utilitário nenhum, e a linha
 * cairia para o `display:grid` sem colunas — que é flex mal desenhado. Pelo
 * mesmo motivo a forma com `trailing` é cada uma das quatro escrita de novo, com
 * um `auto` a mais no fim, e não um sufixo concatenado.
 */
function gridColumns(
  hasLeading: boolean,
  hasMeta: boolean,
  hasDot: boolean,
  hasTrailing: boolean
): string {
  if (hasTrailing) {
    if (hasLeading && hasMeta) return "grid-cols-[auto_88px_1fr_auto_auto_auto]";
    if (hasMeta) return "grid-cols-[88px_1fr_auto_auto_auto]";
    if (hasLeading || hasDot) return "grid-cols-[auto_1fr_auto_auto_auto]";
    return "grid-cols-[1fr_auto_auto_auto]";
  }
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

/**
 * O foco da linha focável. **Inset** porque a linha é faixa de borda a borda
 * dentro de um cartão com `overflow-hidden`: o anel por fora seria cortado nas
 * laterais. **Só no `focus-visible`**: o clique também foca a linha, e um anel a
 * cada clique de mouse seria ruído — ele é para quem navega pelo teclado. O tom
 * é o acento cheio, e não o `accent/15` do `SearchInput`: lá o anel soma à borda
 * que já muda de cor, aqui ele é o único sinal de onde o foco está.
 */
const FOCUS_RING =
  "outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent";

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
    nested = false,
    execution,
    selected = false,
    onClick,
    trailing,
    onContextMenu,
    onKeyDown,
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
  const hasTrailing = Boolean(trailing);

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

  /**
   * A marca é o `ExecutionDot` — o mesmo ponto do card do popup e do chip da
   * barra de título. O que ele desenha, e por que só quem roda pulsa, está na
   * definição dele.
   */
  const executionMark = execution && <ExecutionDot execution={execution} />;

  /**
   * A marca de execução e as do call site dividem o mesmo grupo, e a de execução
   * vem primeiro: ela fala do agora, e recorrência e sino falam do sempre.
   */
  const marks = (executionMark || titleMarks) && (
    <>
      {executionMark}
      {titleMarks}
    </>
  );

  /**
   * A seleção vence o fundo. Ela é o gesto que o usuário está fazendo, e a
   * execução continua dita pela marca ao lado do nome — enquanto o realce vence,
   * a linha marcada some no meio das outras justamente enquanto se escolhe o que
   * excluir.
   */
  const background = selected
    ? "bg-accent/10 hover:bg-accent/15"
    : execution === "running"
      ? "bg-accent/5 hover:bg-accent/10"
      : execution === "paused"
        ? "bg-paused/5 hover:bg-paused/10"
        : "hover:bg-surface";

  const name = (
    <p className={`text-sm truncate ${completed ? "line-through text-fg-muted" : "text-fg"}`}>
      {title}
    </p>
  );

  const nameBlock = (
    <div className="min-w-0">
      {marks ? (
        <div className="min-w-0 flex items-center gap-1.5">
          {name}
          {marks}
        </div>
      ) : (
        name
      )}
      {subtitle && <p className="text-xs text-fg-muted truncate mt-px">{subtitle}</p>}
    </div>
  );

  /*
   * O ⋯ tem célula só dele, **sempre visível**, e é a primeira da direita (H2).
   * Antes ele dividia a célula com a duração, empilhado por `col-start-1
   * row-start-1`: a duração recuava no hover e ele tomava o lugar dela — que é o
   * que fazia o tempo sumir no Histórico e nas entradas de hoje no instante em
   * que o cursor entrava na linha.
   *
   * A célula é emitida **mesmo sem ações**, porque é ela que mantém a contagem
   * de colunas igual à do `gridColumns`. Vazia ela mede 0, e o que sobra é um
   * `gap` da grade — o mesmo que a célula vazia já cobrava quando vinha no fim.
   */
  const actionsCell = <div className="flex items-center gap-0.5">{actions}</div>;

  /*
   * Marcas, chip e duração numa célula só, no `gap` da própria grade: são três
   * dados que o wireframe desenha lado a lado, e juntá-los é o que deixa a
   * duração **depois** do chip (H2) sem abrir uma quarta coluna à direita — que
   * sairia do `1fr` do nome em toda linha que não mede tempo.
   */
  const dataCell = (
    <div className="flex items-center gap-2.5">
      {badges}
      {billableChip}
      {duration && (
        <span className="text-sm font-mono tabular-nums text-fg-secondary">{duration}</span>
      )}
    </div>
  );

  return (
    <div
      onClick={onClick}
      onContextMenu={onContextMenu}
      onKeyDown={onKeyDown}
      tabIndex={onKeyDown ? 0 : undefined}
      className={`group grid items-center ${gridColumns(hasLeading, hasMeta, Boolean(dotColor), hasTrailing)} gap-2.5 py-2.5 pr-3 border-b border-border-subtle last:border-b-0 transition-colors ${
        nested ? `relative ${PADDING_LEFT.nested}` : PADDING_LEFT.row
      } ${background} ${onClick ? "cursor-pointer" : ""}${onKeyDown ? ` ${FOCUS_RING}` : ""}`}
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
       * A ordem da direita é **⋯ · chip · duração · ▶** (H2), e o ⋯ vem primeiro
       * porque é o único que existe em toda linha: ancorado antes do chip, ele
       * cai no mesmo x tenha a linha chip, duração, as duas coisas ou nenhuma —
       * e, não crescendo mais no hover, nada à direita dele se move.
       */}
      {actionsCell}
      {dataCell}

      {/*
       * Depois da duração e por último: é a coluna que não pode andar.
       */}
      {hasTrailing && <div className="flex items-center">{trailing}</div>}

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
