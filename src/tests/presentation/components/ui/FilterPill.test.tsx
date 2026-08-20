import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { FilterPill } from "@presentation/components/ui/FilterPill";

describe("FilterPill", () => {
  it("anuncia se o filtro está aplicado", () => {
    const { rerender } = render(
      <FilterPill active onClick={vi.fn()}>
        Hoje
      </FilterPill>
    );
    expect(screen.getByRole("button").getAttribute("aria-pressed")).toBe("true");

    rerender(<FilterPill onClick={vi.fn()}>Hoje</FilterPill>);
    expect(screen.getByRole("button").getAttribute("aria-pressed")).toBe("false");
  });

  it("mostra a contagem quando ela existe, inclusive zero", () => {
    render(
      <FilterPill onClick={vi.fn()} count={0}>
        Projetos
      </FilterPill>
    );
    expect(screen.getByText("0")).toBeTruthy();
  });

  it("desabilitada não dispara o filtro", () => {
    const onClick = vi.fn();
    render(
      <FilterPill onClick={onClick} disabled>
        Semana
      </FilterPill>
    );
    screen.getByRole("button").click();
    expect(onClick).not.toHaveBeenCalled();
  });
});
