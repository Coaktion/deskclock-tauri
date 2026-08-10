import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { TaskRow } from "@presentation/components/ui/TaskRow";

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
    const { rerender } = render(<TaskRow title="a" duration="1h" billable />);
    expect(screen.getByText("Billable")).toBeTruthy();

    rerender(<TaskRow title="a" duration="1h" billable={false} />);
    expect(screen.getByText("Non-billable")).toBeTruthy();

    rerender(<TaskRow title="a" duration="1h" />);
    expect(screen.queryByText("Billable")).toBeNull();
    expect(screen.queryByText("Non-billable")).toBeNull();
  });

  it("a linha aninhada ganha trilho e degrau, e o trilho fica fora do fluxo", () => {
    // O trilho não pode ser filho em fluxo: a grade tem uma coluna por célula,
    // e um filho a mais empurraria a última para fora do gabarito.
    const { container, rerender } = render(<TaskRow title="a" duration="1h" nested />);
    const row = container.firstElementChild!;
    expect(row.className).toContain("pl-6");
    expect(container.querySelector("span.absolute")).not.toBeNull();

    rerender(<TaskRow title="a" duration="1h" />);
    expect(container.firstElementChild!.className).toContain("pl-3");
    expect(container.querySelector("span.absolute")).toBeNull();
  });

  it("o chip só alterna quando a linha entrega o clique", () => {
    const { rerender } = render(<TaskRow title="a" duration="1h" billable />);
    expect(screen.queryByRole("button")).toBeNull();

    const onToggleBillable = vi.fn();
    rerender(<TaskRow title="a" duration="1h" billable onToggleBillable={onToggleBillable} />);
    screen.getByRole("button").click();
    expect(onToggleBillable).toHaveBeenCalled();
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
