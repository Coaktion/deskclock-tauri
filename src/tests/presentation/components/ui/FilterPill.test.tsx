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

    rerender(
      <FilterPill active={false} onClick={vi.fn()}>
        Hoje
      </FilterPill>
    );
    expect(screen.getByRole("button").getAttribute("aria-pressed")).toBe("false");
  });

  it("sem `active`, não se anuncia como alternável", () => {
    // A pílula que dispara e volta ao mesmo estado — o ⚡ de uma ação só — seria
    // um toggle preso em "não pressionado" se o atributo saísse sempre.
    render(<FilterPill onClick={vi.fn()}>Abrir</FilterPill>);
    expect(screen.getByRole("button").getAttribute("aria-pressed")).toBeNull();
  });

  it("aceita um nome acessível quando o conteúdo é só um número", () => {
    render(
      <FilterPill
        onClick={vi.fn()}
        title="Abrir uma das 2 ações"
        aria-label="Abrir uma das 2 ações"
      >
        2
      </FilterPill>
    );
    expect(screen.getByRole("button", { name: "Abrir uma das 2 ações" })).toBeTruthy();
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
