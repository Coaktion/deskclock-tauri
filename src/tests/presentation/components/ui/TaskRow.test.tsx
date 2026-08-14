import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
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
});
