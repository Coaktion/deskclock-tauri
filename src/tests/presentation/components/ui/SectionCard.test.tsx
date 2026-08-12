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

  /** Sozinho ele é um controle: sem cabeçalho, sumiria sem erro nenhum. */
  it("o slot da esquerda sozinho basta para o cabeçalho existir", () => {
    const { container } = render(
      <SectionCard leading={<input type="checkbox" aria-label="Selecionar" />}>x</SectionCard>
    );
    expect(screen.getByLabelText("Selecionar")).toBeTruthy();
    expect(hasHeader(container)).toBe(true);
  });

  /** A caixa precede o título — é o que a alinha às caixas das linhas de dentro. */
  it("o slot da esquerda vem antes do título", () => {
    render(
      <SectionCard title="Sex, 07/08" leading={<input type="checkbox" aria-label="Selecionar" />}>
        x
      </SectionCard>
    );
    const caixa = screen.getByLabelText("Selecionar");
    const titulo = screen.getByText("Sex, 07/08");

    expect(caixa.compareDocumentPosition(titulo)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
  });
});
