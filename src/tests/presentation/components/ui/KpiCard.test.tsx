import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { KpiCard } from "@presentation/components/ui/KpiCard";

/** A barra é o único elemento com largura em estilo em linha. */
function barWidth(container: HTMLElement): string | undefined {
  return container.querySelector<HTMLElement>("[style*='width']")?.style.width;
}

describe("KpiCard", () => {
  it("sem barPct desenha o trilho vazio — é ele que preserva a altura do cartão", () => {
    const cheio = render(<KpiCard label="Billable" value="4:00" barPct={50} />).container;
    const vazio = render(<KpiCard label="Registros" value="12" />).container;

    expect(screen.getByText("12")).toBeTruthy();
    expect(barWidth(vazio)).toBeUndefined();
    // A única diferença entre os dois é o preenchimento: o trilho, que dá a
    // altura, está nos dois.
    expect(vazio.querySelectorAll("div").length).toBe(cheio.querySelectorAll("div").length - 1);
  });

  it("prende a barra entre 0 e 100", () => {
    expect(barWidth(render(<KpiCard label="a" value="1" barPct={140} />).container)).toBe("100%");
    expect(barWidth(render(<KpiCard label="b" value="1" barPct={-5} />).container)).toBe("0%");
  });
});
