import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { RowMenuTrigger } from "@presentation/components/ui";

afterEach(cleanup);

describe("RowMenuTrigger", () => {
  it("alterna o menu ancorado ao próprio invólucro, sem o clique chegar à linha", () => {
    const toggleFrom = vi.fn();
    const onRow = vi.fn();
    render(
      <div onClick={onRow}>
        <RowMenuTrigger menu={{ fromTrigger: false, toggleFrom }} />
      </div>
    );
    const botao = screen.getByRole("button", { name: "Mais ações" });
    fireEvent.click(botao);
    expect(toggleFrom).toHaveBeenCalledWith(botao.parentElement);
    expect(onRow).not.toHaveBeenCalled();
  });

  it("diz-se pressionado conforme o menu foi aberto por ele", () => {
    const { rerender } = render(
      <RowMenuTrigger menu={{ fromTrigger: false, toggleFrom: vi.fn() }} />
    );
    const botao = () => screen.getByRole("button", { name: "Mais ações" });
    expect(botao().getAttribute("aria-pressed")).toBe("false");
    rerender(<RowMenuTrigger menu={{ fromTrigger: true, toggleFrom: vi.fn() }} />);
    expect(botao().getAttribute("aria-pressed")).toBe("true");
  });
});
