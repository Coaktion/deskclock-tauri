import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { KpiCard } from "@presentation/components/ui/KpiCard";

/** A barra é o único elemento com largura em estilo em linha. */
function barWidth(container: HTMLElement): string | undefined {
  return container.querySelector<HTMLElement>("[style*='width']")?.style.width;
}

describe("KpiCard", () => {
  it("sem barPct não desenha barra", () => {
    const { container } = render(<KpiCard label="Registros" value="12" />);
    expect(screen.getByText("12")).toBeTruthy();
    expect(barWidth(container)).toBeUndefined();
  });

  it("prende a barra entre 0 e 100", () => {
    expect(barWidth(render(<KpiCard label="a" value="1" barPct={140} />).container)).toBe("100%");
    expect(barWidth(render(<KpiCard label="b" value="1" barPct={-5} />).container)).toBe("0%");
  });
});
