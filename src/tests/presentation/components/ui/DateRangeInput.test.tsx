import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { DateRangeInput } from "@presentation/components/ui/DateRangeInput";
import { dateRangeFor } from "@shared/utils/datePresets";

/** Quarta-feira, para a semana do calendário não coincidir com a janela móvel. */
const QUARTA = new Date(2026, 8, 9, 12, 0, 0);

function campo(): HTMLInputElement {
  return screen.getByRole("textbox") as HTMLInputElement;
}

/** O nome acessível de uma célula do calendário. */
function dia(numero: number, mes = "setembro", ano = 2026): RegExp {
  return new RegExp(`^${numero} de ${mes} de ${ano}$`);
}

describe("DateRangeInput", () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(QUARTA);
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("mostra as duas pontas numa caixa só", () => {
    render(<DateRangeInput startDate="2026-09-07" endDate="2026-09-13" onChange={() => {}} />);
    expect(campo().value).toBe("07/09/2026 → 13/09/2026");
  });

  it("sem período, mostra o placeholder", () => {
    render(<DateRangeInput startDate="" endDate="" onChange={() => {}} />);
    expect(campo().value).toBe("");
    expect(campo().getAttribute("placeholder")).toBe("Escolher período");
  });

  it("com só o início, diz que falta o fim em vez de fingir um período", () => {
    render(<DateRangeInput startDate="2026-09-07" endDate="" onChange={() => {}} />);
    expect(campo().value).toBe("07/09/2026 → …");
  });

  it("o trilho aplica o período do atalho de uma vez", () => {
    const onChange = vi.fn();
    render(<DateRangeInput startDate="" endDate="" onChange={onChange} presets={["thisWeek"]} />);
    fireEvent.click(campo());
    fireEvent.click(screen.getByRole("button", { name: "Esta semana" }));

    const esperado = dateRangeFor("thisWeek");
    expect(onChange).toHaveBeenCalledWith(esperado.start, esperado.end);
  });

  it("o trilho mostra só os atalhos que a tela pediu, na ordem", () => {
    // A lista é prop porque o que faz sentido depende da tela: a Exportação
    // olha para trás, a Agenda tem a semana que vem à frente.
    render(
      <DateRangeInput
        startDate=""
        endDate=""
        onChange={() => {}}
        presets={["thisWeek", "nextWeek"]}
      />
    );
    fireEvent.click(campo());
    expect(screen.getByRole("button", { name: "Esta semana" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Próxima semana" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Mês passado" })).toBeNull();
  });

  it("acende o atalho cujo período está escolhido, e só ele", () => {
    const semana = dateRangeFor("thisWeek");
    render(
      <DateRangeInput
        startDate={semana.start}
        endDate={semana.end}
        onChange={() => {}}
        presets={["thisWeek", "nextWeek"]}
      />
    );
    fireEvent.click(campo());
    expect(screen.getByRole("button", { name: "Esta semana" }).getAttribute("aria-pressed")).toBe(
      "true"
    );
    expect(
      screen.getByRole("button", { name: "Próxima semana" }).getAttribute("aria-pressed")
    ).toBe("false");
  });

  it("período escolhido à mão não acende atalho nenhum", () => {
    render(
      <DateRangeInput
        startDate="2026-09-02"
        endDate="2026-09-11"
        onChange={() => {}}
        presets={["thisWeek", "nextWeek"]}
      />
    );
    fireEvent.click(campo());
    const acesos = screen
      .getAllByRole("button")
      .filter(
        (b) => b.getAttribute("aria-pressed") === "true" && b.textContent?.includes("semana")
      );
    expect(acesos).toHaveLength(0);
  });

  it("dois cliques fecham o período: o primeiro ancora, o segundo termina", () => {
    const onChange = vi.fn();
    const { rerender } = render(
      <DateRangeInput startDate="" endDate="" onChange={onChange} presets={[]} />
    );
    fireEvent.click(campo());

    fireEvent.click(screen.getByRole("button", { name: dia(10) }));
    expect(onChange).toHaveBeenCalledWith("2026-09-10", "");

    rerender(<DateRangeInput startDate="2026-09-10" endDate="" onChange={onChange} presets={[]} />);
    fireEvent.click(screen.getByRole("button", { name: dia(15) }));
    expect(onChange).toHaveBeenLastCalledWith("2026-09-10", "2026-09-15");
  });

  it("escolher o fim antes do início troca as pontas em vez de recusar", () => {
    // É o clamp que os call sites faziam à mão (`if (d > toDate) setToDate(d)`),
    // agora numa regra só dentro do campo.
    const onChange = vi.fn();
    const { rerender } = render(
      <DateRangeInput startDate="" endDate="" onChange={onChange} presets={[]} />
    );
    fireEvent.click(campo());

    fireEvent.click(screen.getByRole("button", { name: dia(15) }));
    rerender(<DateRangeInput startDate="2026-09-15" endDate="" onChange={onChange} presets={[]} />);
    fireEvent.click(screen.getByRole("button", { name: dia(10) }));

    expect(onChange).toHaveBeenLastCalledWith("2026-09-10", "2026-09-15");
  });

  it("abrir com período completo recomeça no próximo clique", () => {
    const onChange = vi.fn();
    render(
      <DateRangeInput
        startDate="2026-09-07"
        endDate="2026-09-13"
        onChange={onChange}
        presets={[]}
      />
    );
    fireEvent.click(campo());
    fireEvent.click(screen.getByRole("button", { name: dia(21) }));
    expect(onChange).toHaveBeenCalledWith("2026-09-21", "");
  });

  it("o rodapé diz qual ponta falta", () => {
    const { rerender } = render(
      <DateRangeInput startDate="" endDate="" onChange={() => {}} presets={[]} />
    );
    fireEvent.click(campo());
    expect(screen.getByText("Escolha o início do período")).toBeTruthy();

    rerender(<DateRangeInput startDate="2026-09-10" endDate="" onChange={() => {}} presets={[]} />);
    expect(screen.getByText("Escolha o fim do período")).toBeTruthy();
  });

  it("com o painel aberto o Enter é daqui, e fechado ele sobe", () => {
    render(<DateRangeInput startDate="" endDate="" onChange={() => {}} presets={[]} />);

    expect(fireEvent.keyDown(campo(), { key: "Enter" })).toBe(true);

    fireEvent.click(campo());
    expect(fireEvent.keyDown(campo(), { key: "Enter" })).toBe(false);
    expect(screen.queryByRole("button", { name: "Anterior" })).toBeNull();
  });

  it("o ESC fecha só o painel, e é consumido para não fechar o modal em volta", () => {
    render(<DateRangeInput startDate="" endDate="" onChange={() => {}} presets={[]} />);
    fireEvent.click(campo());

    expect(fireEvent.keyDown(campo(), { key: "Escape" })).toBe(false);
    expect(screen.queryByRole("button", { name: "Anterior" })).toBeNull();
  });

  it("o ↓ abre o painel para quem chegou pelo teclado", () => {
    render(<DateRangeInput startDate="" endDate="" onChange={() => {}} presets={[]} />);
    fireEvent.keyDown(campo(), { key: "ArrowDown" });
    expect(screen.getByRole("button", { name: "Anterior" })).toBeTruthy();
  });

  it("com rótulo, o campo abre mão da casca própria para o Field em volta", () => {
    render(
      <DateRangeInput startDate="" endDate="" onChange={() => {}} label="Período" presets={[]} />
    );
    expect(screen.getByText("Período")).toBeTruthy();
    expect(campo().className).toContain("bg-transparent");
  });
});
