import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { Calendar } from "@presentation/components/ui/Calendar";
import { todayISO } from "@shared/utils/time";
import { formatBrDate } from "@shared/utils/calendarGrid";

/** O nome acessível que a célula anuncia — é por ele que os testes a pegam. */
function rotulo(iso: string): string {
  const [dia, mes, ano] = formatBrDate(iso).split("/");
  const nomes = [
    "janeiro",
    "fevereiro",
    "março",
    "abril",
    "maio",
    "junho",
    "julho",
    "agosto",
    "setembro",
    "outubro",
    "novembro",
    "dezembro",
  ];
  return `${Number(dia)} de ${nomes[Number(mes) - 1]} de ${ano}`;
}

describe("Calendar", () => {
  it("abre no mês do valor, não no mês corrente", () => {
    render(<Calendar value="2026-03-14" onSelect={() => {}} />);
    expect(screen.getByRole("button", { name: "Março" })).toBeTruthy();
    expect(screen.getByRole("button", { name: rotulo("2026-03-14") })).toBeTruthy();
  });

  it("sem valor, abre no mês de hoje", () => {
    render(<Calendar value="" onSelect={() => {}} />);
    expect(screen.getByRole("button", { name: rotulo(todayISO()) })).toBeTruthy();
  });

  it("anuncia a data escolhida como pressionada, e só ela", () => {
    render(<Calendar value="2026-03-14" onSelect={() => {}} />);
    const pressionadas = screen
      .getAllByRole("button")
      .filter((b) => b.getAttribute("aria-pressed") === "true");
    expect(pressionadas).toHaveLength(1);
    expect(pressionadas[0].getAttribute("aria-label")).toBe(rotulo("2026-03-14"));
  });

  it("marca hoje com `aria-current`, que é papel diferente de escolhido", () => {
    // É a distinção que a folha do react-day-picker não fazia: hoje e a seleção
    // pintavam caixa, e o mês corrente abria parecendo ter duas datas escolhidas.
    render(<Calendar value="" onSelect={() => {}} />);
    const hoje = screen.getByRole("button", { name: rotulo(todayISO()) });
    expect(hoje.getAttribute("aria-current")).toBe("date");
    expect(hoje.getAttribute("aria-pressed")).toBe("false");
  });

  it("devolve o ISO do dia clicado", () => {
    const onSelect = vi.fn();
    render(<Calendar value="2026-03-14" onSelect={onSelect} />);
    fireEvent.click(screen.getByRole("button", { name: rotulo("2026-03-20") }));
    expect(onSelect).toHaveBeenCalledWith("2026-03-20");
  });

  it("navega de mês pelo ‹ ›, virando o ano em dezembro", () => {
    render(<Calendar value="2026-12-10" onSelect={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: "Próximo" }));
    expect(screen.getByRole("button", { name: "Janeiro" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "2027" })).toBeTruthy();
  });

  it("o mês e o ano são dois alvos: cada um abre a sua grade", () => {
    render(<Calendar value="2026-03-14" onSelect={() => {}} />);

    fireEvent.click(screen.getByRole("button", { name: "Março" }));
    expect(screen.getByRole("button", { name: "Setembro" })).toBeTruthy();
    // Na grade de meses não há dia nenhum para clicar.
    expect(screen.queryByRole("button", { name: rotulo("2026-03-14") })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "2026" }));
    expect(screen.getByRole("button", { name: "2031" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Setembro" })).toBeNull();
  });

  it("escolher o mês volta para os dias; escolher o ano volta para os meses", () => {
    render(<Calendar value="2026-03-14" onSelect={() => {}} />);

    fireEvent.click(screen.getByRole("button", { name: "Março" }));
    fireEvent.click(screen.getByRole("button", { name: "Setembro" }));
    expect(screen.getByRole("button", { name: rotulo("2026-09-15") })).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "2026" }));
    fireEvent.click(screen.getByRole("button", { name: "2024" }));
    expect(screen.getByRole("button", { name: "Setembro" })).toBeTruthy();
  });

  it("escolher mês ou ano não escolhe data — só muda a vista", () => {
    const onSelect = vi.fn();
    render(<Calendar value="2026-03-14" onSelect={onSelect} />);
    fireEvent.click(screen.getByRole("button", { name: "Março" }));
    fireEvent.click(screen.getByRole("button", { name: "Setembro" }));
    expect(onSelect).not.toHaveBeenCalled();
  });

  it("desabilita o que passa do `maxISO`", () => {
    render(<Calendar value="2026-03-14" onSelect={() => {}} maxISO="2026-03-20" />);
    expect(screen.getByRole("button", { name: rotulo("2026-03-20") }).hasAttribute("disabled")).toBe(
      false
    );
    expect(screen.getByRole("button", { name: rotulo("2026-03-21") }).hasAttribute("disabled")).toBe(
      true
    );
  });

  it("move o foco por seta e atravessa a borda do mês", () => {
    // A navegação por seta existe porque o react-day-picker a tinha: sair dele
    // sem ela trocaria a dependência por uma regressão de teclado.
    render(<Calendar value="2026-03-01" onSelect={() => {}} />);
    const dia1 = screen.getByRole("button", { name: rotulo("2026-03-01") });
    expect(dia1.getAttribute("tabindex")).toBe("0");

    fireEvent.keyDown(dia1, { key: "ArrowLeft" });
    expect(screen.getByRole("button", { name: "Fevereiro" })).toBeTruthy();
    expect(
      screen.getByRole("button", { name: rotulo("2026-02-28") }).getAttribute("tabindex")
    ).toBe("0");
  });

  it("uma célula por vez recebe o tab — o resto sai da ordem de tabulação", () => {
    render(<Calendar value="2026-03-14" onSelect={() => {}} />);
    const naOrdem = screen
      .getAllByRole("button")
      .filter((b) => b.hasAttribute("data-iso") && b.getAttribute("tabindex") === "0");
    expect(naOrdem).toHaveLength(1);
  });

  it("a seta não leva o foco além do `maxISO`", () => {
    render(<Calendar value="2026-03-20" onSelect={() => {}} maxISO="2026-03-20" />);
    const dia = screen.getByRole("button", { name: rotulo("2026-03-20") });
    fireEvent.keyDown(dia, { key: "ArrowRight" });
    expect(dia.getAttribute("tabindex")).toBe("0");
  });

  it("sem rodapé não desenha a régua que o separa da grade", () => {
    const { container, rerender } = render(<Calendar value="" onSelect={() => {}} />);
    expect(container.querySelector(".border-t")).toBeNull();

    rerender(<Calendar value="" onSelect={() => {}} footer={<button>Hoje</button>} />);
    expect(container.querySelector(".border-t")).toBeTruthy();
  });
});
