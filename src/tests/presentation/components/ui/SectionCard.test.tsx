import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { SectionCard } from "@presentation/components/ui/SectionCard";

/** O cabeçalho é o único bloco opcional: sem título nem descrição ele some. */
function hasHeader(container: HTMLElement): boolean {
  return container.firstElementChild!.children.length > 1;
}

describe("SectionCard", () => {
  it("sem título nem descrição não desenha cabeçalho", () => {
    const { container } = render(<SectionCard>conteúdo</SectionCard>);
    expect(screen.getByText("conteúdo")).toBeTruthy();
    expect(hasHeader(container)).toBe(false);
  });

  it("a descrição sozinha basta para o cabeçalho existir", () => {
    const { container } = render(<SectionCard description="explica">x</SectionCard>);
    expect(screen.getByText("explica")).toBeTruthy();
    expect(hasHeader(container)).toBe(true);
  });
});
