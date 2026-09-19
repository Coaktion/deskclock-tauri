import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { TaskRow } from "@presentation/components/ui/TaskRow";
import { geometryOf } from "../../../helpers/tailwindGeometry";

describe("TaskRow", () => {
  it("mostra nome, subtítulo e duração", () => {
    render(<TaskRow title="Daily" subtitle="Projeto · Reuniões" duration="0:15" />);
    expect(screen.getByText("Daily")).toBeTruthy();
    expect(screen.getByText("Projeto · Reuniões")).toBeTruthy();
    expect(screen.getByText("0:15")).toBeTruthy();
  });

  it("sem duração, não sobra o espaço dela", () => {
    const { container } = render(<TaskRow title="Daily" />);
    expect(container.querySelector(".tabular-nums")).toBeNull();
  });

  it("o ponto do projeto não é clicável — ele é cor de projeto, nada mais", () => {
    render(<TaskRow title="a" duration="1h" dotColor="#fff" />);
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("escreve o faturamento, e cala sobre ele quando a linha não o informa", () => {
    const alterna = vi.fn();
    const { rerender } = render(
      <TaskRow title="a" duration="1h" billable onToggleBillable={alterna} />
    );
    expect(screen.getByText("Billable")).toBeTruthy();

    rerender(<TaskRow title="a" duration="1h" billable={false} onToggleBillable={alterna} />);
    expect(screen.getByText("Non-billable")).toBeTruthy();

    rerender(<TaskRow title="a" duration="1h" />);
    expect(screen.queryByText("Billable")).toBeNull();
    expect(screen.queryByText("Non-billable")).toBeNull();
  });

  it("a linha aninhada ganha trilho e degrau, e o trilho fica fora do fluxo", () => {
    // O trilho não pode ser filho em fluxo: a grade tem uma coluna por célula,
    // e um filho a mais empurraria a última para fora do gabarito.
    const { container, rerender } = render(<TaskRow title="a" duration="1h" nested />);
    expect(container.querySelector("span.absolute")).not.toBeNull();

    rerender(<TaskRow title="a" duration="1h" />);
    expect(container.querySelector("span.absolute")).toBeNull();
  });

  /**
   * O trilho desce pelo **meio** do chevron do grupo, e as três medidas que
   * fazem isso valer moram em lugares que o CSS não liga sozinho: o padding vem
   * de uma classe do Tailwind, a largura da coluna de um `style`, e o x do
   * trilho de uma conta. Esta é a amarração — se alguém trocar `pl-3` por `pl-4`
   * ou mudar a escala do ícone, o trilho sai do eixo e é aqui que se descobre.
   */
  it("o trilho desce pelo eixo do chevron da linha em volta", () => {
    const semAninhar = render(<TaskRow title="a" leading={<span />} />);
    const paddingDoPai = geometryOf(semAninhar.container.firstElementChild!.className).paddingLeft;
    const colunaDoChevron =
      semAninhar.container.querySelector<HTMLElement>("[data-leading]")!.style.width;

    const aninhada = render(<TaskRow title="a" leading={<span />} nested />);
    const linha = aninhada.container.firstElementChild as HTMLElement;
    const trilho = linha.querySelector<HTMLElement>("span.absolute")!;

    expect(paddingDoPai).toBeDefined();
    expect(Number.parseFloat(trilho.style.left)).toBe(
      paddingDoPai! + Number.parseFloat(colunaDoChevron) / 2
    );
    // E o degrau da filha é um padding a mais, não um número solto.
    expect(geometryOf(linha.className).paddingLeft).toBe(paddingDoPai! * 2);
  });

  /**
   * Duração e ações dividem a mesma célula, e no hover a duração vai a
   * `opacity-0` — que **cria contexto de empilhamento** e a joga para a camada de
   * cima, acima das ações. Invisível ela continua sendo alvo de clique, e como
   * está alinhada à direita, cobre justamente os últimos botões: era por isso que
   * o "Excluir" da linha não respondia. O jsdom não faz hit-test, então o que dá
   * para amarrar aqui é a classe que tira a duração do caminho.
   */
  it("a duração não intercepta o clique das ações que ela cobre", () => {
    const { container } = render(
      <TaskRow title="a" duration="1h" actions={<button type="button">x</button>} />
    );
    const duracao = container.querySelector(".tabular-nums")!;
    expect(duracao.className).toContain("pointer-events-none");
  });

  /**
   * O par `billable`/`onToggleBillable` é união nas props, então a linha que
   * desenha o chip mudo não compila — o que este teste guarda é o outro lado:
   * onde o chip aparece, ele é o controle, e a linha sem faturamento não
   * inventa botão nenhum.
   */
  it("o chip é sempre o controle do faturamento, nunca um rótulo", () => {
    const onToggleBillable = vi.fn();
    const { rerender } = render(
      <TaskRow title="a" duration="1h" billable onToggleBillable={onToggleBillable} />
    );
    screen.getByRole("button").click();
    expect(onToggleBillable).toHaveBeenCalled();

    rerender(<TaskRow title="a" duration="1h" />);
    expect(screen.queryByRole("button")).toBeNull();
  });

  /**
   * Quem abre em largura paga com o `1fr` do nome, e arrasta para a esquerda
   * tudo o que estiver à direita dele. Com o chip **antes** das ações ele andava
   * ~118px no instante em que o cursor entrava na linha, e quem herdava o lugar
   * dele era o último botão da fileira — o "Excluir" do Planejamento, que não
   * pergunta. O jsdom não faz layout, então o que dá para amarrar é a ordem: nada
   * que abra em largura pode ficar entre o nome e o chip.
   */
  it("o chip fica ancorado depois da célula que abre em largura", () => {
    const { container } = render(
      <TaskRow
        title="a"
        billable
        onToggleBillable={() => {}}
        collapseActions
        actions={<span data-acoes="" />}
      />
    );
    const celulas = [...container.firstElementChild!.children];
    const acoes = celulas.findIndex((c) => c.querySelector("[data-acoes]"));
    const chip = celulas.findIndex((c) => c.querySelector("button"));

    expect(acoes).toBeGreaterThanOrEqual(0);
    expect(chip).toBeGreaterThan(acoes);
    // E a célula fechada não pode cobrar o `gap` da grade que ela não ocupa, ou
    // o chip nasce 10px à direita de onde as outras linhas o põem.
    expect(celulas[acoes].className).toMatch(/(?:^|\s)-mr-2\.5(?:\s|$)/);
    expect(celulas[acoes].className).toMatch(/(?:^|\s)group-hover:mr-0(?:\s|$)/);
  });

  /**
   * O outro lado da mesma regra: com duração a célula já está reservada, nada se
   * move no hover, e ali o chip continua antes — que é o que o design desenha nas
   * Entradas. Inverter as duas ordens seria mudar a linha que não tem o defeito.
   */
  it("com duração, a célula já está reservada e o chip volta a vir antes", () => {
    const { container } = render(
      <TaskRow
        title="a"
        duration="1h"
        billable
        onToggleBillable={() => {}}
        actions={<span data-acoes="" />}
      />
    );
    const celulas = [...container.firstElementChild!.children];
    const acoes = celulas.findIndex((c) => c.querySelector("[data-acoes]"));
    const chip = celulas.findIndex((c) => c.querySelector("button"));

    expect(chip).toBeGreaterThanOrEqual(0);
    expect(acoes).toBeGreaterThan(chip);
    expect(celulas[acoes].className).not.toMatch(/-mr-2\.5/);
  });

  it("alternar o faturamento não aciona a linha em volta", () => {
    const onClick = vi.fn();
    const onToggleBillable = vi.fn();
    render(
      <TaskRow
        title="a"
        duration="1h"
        billable
        onToggleBillable={onToggleBillable}
        onClick={onClick}
      />
    );

    screen.getByRole("button").click();
    expect(onToggleBillable).toHaveBeenCalled();
    expect(onClick).not.toHaveBeenCalled();
  });

  /**
   * O realce é **par**: a marca ao lado do nome e o fundo da faixa. Sozinho, o
   * fundo não diz nada a quem não distingue o tom, e sozinha a marca de 6px some
   * numa lista cheia.
   */
  it("a linha em execução pulsa ao lado do nome e tinge a faixa", () => {
    const { container } = render(<TaskRow title="Daily" execution="running" />);
    const marca = screen.getByTitle("Em execução");

    expect(marca.className).toContain("animate-pulse");
    expect(marca.className).toContain("bg-accent");
    expect(container.firstElementChild!.className).toContain("bg-accent/5");
  });

  /** Pausada é outro estado, não o mesmo mais fraco: sem pulso e no tom da pausa. */
  it("a linha pausada tem marca e tom próprios, e não pulsa", () => {
    const { container } = render(<TaskRow title="Daily" execution="paused" />);
    const marca = screen.getByTitle("Pausada");

    expect(marca.className).not.toContain("animate-pulse");
    expect(marca.className).toContain("bg-paused");
    expect(container.firstElementChild!.className).toContain("bg-paused/5");
  });

  /**
   * A seleção vence o fundo — é o gesto em curso —, e a marca continua: perder as
   * duas coisas ao marcar a caixa esconderia justamente a linha que não se quer
   * excluir por engano.
   */
  it("selecionada e em execução, o fundo é o da seleção e a marca fica", () => {
    const { container } = render(<TaskRow title="Daily" execution="running" selected />);

    expect(container.firstElementChild!.className).toContain("bg-accent/10");
    expect(container.firstElementChild!.className).not.toContain("bg-accent/5");
    expect(screen.getByTitle("Em execução")).toBeTruthy();
  });

  /**
   * O outro lado, e o que guarda os call sites que não passam a prop: sem
   * `execution` a linha é exatamente a de antes.
   */
  it("sem execução, a linha não ganha marca nem tinta", () => {
    const { container } = render(<TaskRow title="Daily" duration="1h" />);

    expect(screen.queryByTitle("Em execução")).toBeNull();
    expect(screen.queryByTitle("Pausada")).toBeNull();
    expect(container.firstElementChild!.className).toContain("hover:bg-surface");
    expect(container.firstElementChild!.className).not.toContain("bg-accent/5");
    expect(container.firstElementChild!.className).not.toContain("bg-paused/5");
  });

  /**
   * `false` é o que o `PlannedTaskItem` passa em `titleMarks` quando não há
   * recorrência nem sino, e sem execução o grupo de marcas não pode nascer vazio
   * — um invólucro a mais mudaria a linha nos call sites que não realçam.
   */
  it("sem marca nenhuma, o grupo ao lado do nome não é emitido", () => {
    const { container } = render(<TaskRow title="Daily" titleMarks={false} />);

    expect(container.querySelector(".gap-1\\.5")).toBeNull();
  });

  /**
   * As duas marcas dividem o mesmo grupo ao lado do nome, e compor não pode
   * custar nenhuma delas — foi o que quase aconteceu: o grupo só existia quando
   * o call site passava `titleMarks`.
   */
  it("a marca de execução convive com as marcas do call site", () => {
    render(
      <TaskRow title="Daily" execution="running" titleMarks={<span data-marca="recorrente" />} />
    );

    const marca = screen.getByTitle("Em execução");
    const grupo = marca.parentElement!;

    expect(grupo.querySelector("[data-marca]")).not.toBeNull();
    expect(grupo.textContent).toContain("Daily");
    // E a de execução vem primeiro: ela fala do agora.
    expect([...grupo.children].indexOf(marca)).toBeLessThan(
      [...grupo.children].findIndex((c) => c.hasAttribute("data-marca"))
    );
  });

  /**
   * Os call sites de hoje não passam `trailing`, e a grade deles não pode mudar
   * nem de caractere: são as quatro formas do censo, afirmadas uma a uma — e,
   * com `trailing`, cada uma com um `auto` a mais no fim.
   */
  const FORMAS: [string, { leading?: ReactNode; meta?: string; dotColor?: string }, string][] = [
    ["chevron e faixa", { leading: <span />, meta: "09:00" }, "auto_88px_1fr_auto_auto"],
    ["só a faixa", { meta: "09:00" }, "88px_1fr_auto_auto"],
    ["só o ponto", { dotColor: "#fff" }, "auto_1fr_auto_auto"],
    ["nada antes do nome", {}, "1fr_auto_auto"],
  ];

  const gradeDe = (el: Element) =>
    el.className.split(/\s+/).find((c) => c.startsWith("grid-cols-"));

  it.each(FORMAS)("sem `trailing`, %s: a grade é a de antes", (_, props, colunas) => {
    const { container } = render(<TaskRow title="a" {...props} />);
    expect(gradeDe(container.firstElementChild!)).toBe(`grid-cols-[${colunas}]`);
  });

  it.each(FORMAS)("com `trailing`, %s: a grade ganha uma coluna no fim", (_, props, colunas) => {
    const { container } = render(<TaskRow title="a" {...props} trailing={<span data-play="" />} />);
    expect(gradeDe(container.firstElementChild!)).toBe(`grid-cols-[${colunas}_auto]`);
  });

  it("com `collapseActions`, a ordem é ações → chip → `trailing`", () => {
    const { container } = render(
      <TaskRow
        title="a"
        billable
        onToggleBillable={() => {}}
        collapseActions
        actions={<span data-acoes="" />}
        trailing={<span data-play="" />}
      />
    );
    const celulas = [...container.firstElementChild!.children];
    const acoes = celulas.findIndex((c) => c.querySelector("[data-acoes]"));
    const chip = celulas.findIndex((c) => c.querySelector("button"));
    const play = celulas.findIndex((c) => c.querySelector("[data-play]"));

    expect(acoes).toBeGreaterThanOrEqual(0);
    expect(chip).toBeGreaterThan(acoes);
    expect(play).toBeGreaterThan(chip);
    expect(play).toBe(celulas.length - 1);
  });

  it("com duração, `trailing` também vem depois do chip e da duração", () => {
    const { container } = render(
      <TaskRow
        title="a"
        duration="1h"
        billable
        onToggleBillable={() => {}}
        trailing={<span data-play="" />}
      />
    );
    const celulas = [...container.firstElementChild!.children];
    const chip = celulas.findIndex((c) => c.querySelector("button"));
    const play = celulas.findIndex((c) => c.querySelector("[data-play]"));

    expect(play).toBeGreaterThan(chip);
    expect(play).toBe(celulas.length - 1);
  });

  it("repassa o clique direito ao contêiner da linha", () => {
    const onContextMenu = vi.fn();
    const { container } = render(<TaskRow title="a" onContextMenu={onContextMenu} />);

    fireEvent.contextMenu(container.firstElementChild!);
    expect(onContextMenu).toHaveBeenCalledTimes(1);
  });

  it("com `onKeyDown`, a linha é focável, recebe a tecla e mostra foco só no teclado", () => {
    const onKeyDown = vi.fn();
    const { container } = render(<TaskRow title="a" onKeyDown={onKeyDown} />);
    const linha = container.firstElementChild as HTMLElement;

    expect(linha.getAttribute("tabindex")).toBe("0");
    fireEvent.keyDown(linha, { key: "Enter" });
    expect(onKeyDown).toHaveBeenCalledTimes(1);

    const classes = linha.className.split(/\s+/);
    expect(classes).toEqual(
      expect.arrayContaining([
        "focus-visible:ring-2",
        "focus-visible:ring-inset",
        "focus-visible:ring-accent",
      ])
    );
    expect(classes.filter((c) => c.includes("ring") && !c.startsWith("focus-visible:"))).toEqual(
      []
    );
  });

  it("sem `onKeyDown`, a linha não é parada de Tab nem ganha anel", () => {
    const { container } = render(<TaskRow title="a" duration="1h" />);
    const linha = container.firstElementChild as HTMLElement;

    expect(linha.hasAttribute("tabindex")).toBe(false);
    expect(linha.className).not.toContain("ring");
    expect(linha.className).not.toContain("outline-none");
  });
});
