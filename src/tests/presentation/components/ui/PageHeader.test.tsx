import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { PageHeader } from "@presentation/components/ui/PageHeader";

describe("PageHeader", () => {
  it("marca a casca com o data-tour, não o conteúdo", () => {
    const { container } = render(<PageHeader title="Histórico" tourId="history-header" />);
    const marked = container.querySelector("[data-tour='history-header']");
    expect(marked?.tagName).toBe("HEADER");
  });

  it("só mostra o botão de tour quando há tour a abrir", () => {
    const startTour = vi.fn();
    const { rerender } = render(<PageHeader title="Tarefas" />);
    expect(screen.queryByRole("button", { name: "Ver tour da página" })).toBeNull();

    rerender(<PageHeader title="Tarefas" onStartTour={startTour} />);
    screen.getByRole("button", { name: "Ver tour da página" }).click();
    expect(startTour).toHaveBeenCalled();
  });
});
