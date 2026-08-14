import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { Toggle } from "@presentation/components/ui/Toggle";

describe("Toggle", () => {
  it("é anunciado como chave, com o estado atual", () => {
    render(<Toggle checked onChange={vi.fn()} ariaLabel="Rastrear reuniões" />);
    const knob = screen.getByRole("switch", { name: "Rastrear reuniões" });
    expect(knob.getAttribute("aria-checked")).toBe("true");
  });

  it("emite o valor invertido", () => {
    const onChange = vi.fn();
    render(<Toggle checked={false} onChange={onChange} ariaLabel="x" />);
    screen.getByRole("switch").click();
    expect(onChange).toHaveBeenCalledWith(true);
  });

  it("desabilitado não emite nada", () => {
    const onChange = vi.fn();
    render(<Toggle checked={false} onChange={onChange} disabled ariaLabel="x" />);
    screen.getByRole("switch").click();
    expect(onChange).not.toHaveBeenCalled();
  });

  it("com rótulo, a chave herda o nome dele em vez do ariaLabel", () => {
    render(<Toggle checked onChange={vi.fn()} label="Timer na bandeja" description="ao vivo" />);
    expect(screen.getByRole("switch", { name: "Timer na bandeja" })).toBeTruthy();
    expect(screen.getByText("ao vivo")).toBeTruthy();
  });
});
