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
   * A H2 desempilhou as duas: a duração tinha uma classe que a apagava no hover
   * (`group-hover:opacity-0`) para o ⋯ tomar o lugar dela, e era isso que fazia
   * o tempo sumir no Histórico e nas entradas de hoje. Agora cada uma tem a sua
   * célula, e a duração não ganha classe de estado nenhuma — nem de hover, nem
   * de foco, nem o `pointer-events-none` que o empilhamento cobrava.
   */
  it("a duração não some no hover nem divide célula com o ⋯", () => {
    const { container } = render(
      <TaskRow title="a" duration="1h" actions={<button type="button">x</button>} />
    );
    const duracao = container.querySelector(".tabular-nums")!;

    expect(duracao.className).not.toContain("opacity");
    expect(duracao.className).not.toContain("pointer-events-none");
    expect(duracao.parentElement).not.toBe(screen.getByText("x").parentElement);
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
   * A ordem da direita é **⋯ · chip · duração** (H2), e é a mesma tenha a linha
   * duração ou não: o ⋯ em primeiro é o que o põe no mesmo x em toda linha da
   * lista, e o que o impede de cobrir qualquer dado. O jsdom não faz layout,
   * então o que dá para amarrar é a ordem das células.
   */
  it("o ⋯ vem antes do chip, com duração ou sem ela", () => {
    const ordem = (comDuracao: boolean) => {
      const { container } = render(
        <TaskRow
          title="a"
          duration={comDuracao ? "1h" : undefined}
          billable
          onToggleBillable={() => {}}
          actions={<span data-acoes="" />}
        />
      );
      const celulas = [...container.firstElementChild!.children];
      return {
        acoes: celulas.findIndex((c) => c.querySelector("[data-acoes]")),
        chip: celulas.findIndex((c) => c.querySelector("button")),
      };
    };

    for (const comDuracao of [true, false]) {
      const { acoes, chip } = ordem(comDuracao);
      expect(acoes).toBeGreaterThanOrEqual(0);
      expect(chip).toBeGreaterThan(acoes);
    }
  });

  /**
   * Chip e duração dividem **uma** célula, nessa ordem, e não duas colunas: a
   * quarta coluna sairia do `1fr` do nome em toda linha que não mede tempo — a
   * planejada, que é justamente onde o nome é mais caro.
   */
  it("o chip e a duração dividem a última célula, o chip primeiro", () => {
    const { container } = render(
      <TaskRow
        title="a"
        duration="1h"
        billable
        onToggleBillable={() => {}}
        actions={<span data-acoes="" />}
      />
    );
    const chip = screen.getByRole("button");
    const duracao = container.querySelector(".tabular-nums")!;

    expect(duracao.parentElement).toBe(chip.parentElement);
    expect([...chip.parentElement!.children].indexOf(chip)).toBeLessThan(
      [...chip.parentElement!.children].indexOf(duracao)
    );
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

  it("a ordem da direita é ⋯ → chip → duração → `trailing`", () => {
    const { container } = render(
      <TaskRow
        title="a"
        duration="1h"
        billable
        onToggleBillable={() => {}}
        actions={<span data-acoes="" />}
        trailing={<span data-play="" />}
      />
    );
    const celulas = [...container.firstElementChild!.children];
    const acoes = celulas.findIndex((c) => c.querySelector("[data-acoes]"));
    const chip = celulas.findIndex((c) => c.querySelector("button"));
    const duracao = celulas.findIndex((c) => c.querySelector(".tabular-nums"));
    const play = celulas.findIndex((c) => c.querySelector("[data-play]"));

    expect(acoes).toBeGreaterThanOrEqual(0);
    expect(chip).toBeGreaterThan(acoes);
    expect(duracao).toBe(chip); // mesma célula, o chip antes (ver acima)
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

  /**
   * A H2 apagou as três formas de revelar que a célula tinha — hover,
   * `focus-within` e o par `focus-visible`/`has-[:focus-visible]` da linha
   * focável. O ⋯ está sempre lá, e a única coisa que a classe dele ainda diz é o
   * `gap` entre botões. Vale igual com e sem `onKeyDown`: o motivo de haver duas
   * regras era justamente o clique do mouse deixar o ⋯ "aberto" depois de o
   * cursor sair, e não há mais nada a abrir.
   */
  it.each([
    ["com", () => {}],
    ["sem", undefined],
  ] as const)(
    "%s `onKeyDown`, o ⋯ é sempre visível — sem classe de hover nem de foco",
    (_, onKeyDown) => {
      const { container } = render(
        <TaskRow title="a" onKeyDown={onKeyDown} actions={<span data-acoes="" />} />
      );
      const acoes = container.querySelector("[data-acoes]")!.parentElement!;

      expect(acoes.className).not.toContain("group-hover:");
      expect(acoes.className).not.toContain("group-focus");
      expect(acoes.className).not.toContain("group-has-");
      expect(acoes.className).not.toContain("opacity-0");
      expect(acoes.className).not.toMatch(/(?:^|\s)w-0(?:\s|$)/);
    }
  );

  /**
   * O que a decisão de mostrar ou não a dica faz está em
   * `titleWhenTruncated.test.ts`. O que se afirma aqui é só a ligação: nome e
   * subtítulo truncam, então os dois têm de estar ligados ao handler — foi o
   * subtítulo que ficou de fora na primeira passada.
   */
  it("nome e subtítulo cortados mostram o texto inteiro ao passar o cursor", () => {
    render(<TaskRow title="Nome muito longo" subtitle="Projeto · Categoria muito longa" />);

    for (const texto of ["Nome muito longo", "Projeto · Categoria muito longa"]) {
      const el = screen.getByText(texto);
      Object.defineProperty(el, "scrollWidth", { value: 420, configurable: true });
      Object.defineProperty(el, "clientWidth", { value: 190, configurable: true });

      fireEvent.mouseEnter(el);
      expect(el.getAttribute("title")).toBe(texto);
    }
  });

  it("sem `onKeyDown`, a linha não é parada de Tab nem ganha anel", () => {
    const { container } = render(<TaskRow title="a" duration="1h" />);
    const linha = container.firstElementChild as HTMLElement;

    expect(linha.hasAttribute("tabindex")).toBe(false);
    expect(linha.className).not.toContain("ring");
    expect(linha.className).not.toContain("outline-none");
  });
});
