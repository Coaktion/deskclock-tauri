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

  it("o ponto do projeto só é botão quando há o que clicar", () => {
    const { rerender } = render(<TaskRow title="a" duration="1h" dotColor="#fff" />);
    expect(screen.queryByRole("button")).toBeNull();

    const onDotClick = vi.fn();
    rerender(<TaskRow title="a" duration="1h" dotColor="#fff" onDotClick={onDotClick} />);
    screen.getByRole("button").click();
    expect(onDotClick).toHaveBeenCalled();
  });

  it("desenha a faixa de billable só quando a tarefa é faturável", () => {
    const { container, rerender } = render(<TaskRow title="a" duration="1h" billable />);
    expect(container.querySelector(".bg-billable")).toBeTruthy();

    rerender(<TaskRow title="a" duration="1h" />);
    expect(container.querySelector(".bg-billable")).toBeNull();
  });
});
