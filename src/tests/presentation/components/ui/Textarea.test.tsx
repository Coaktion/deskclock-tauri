import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { Textarea } from "@presentation/components/ui/Textarea";

describe("Textarea", () => {
  it("cresce só na vertical — na horizontal escaparia da coluna do formulário", () => {
    render(<Textarea aria-label="Projetos" />);
    const cls = screen.getByLabelText("Projetos").className;
    expect(cls).toContain("resize-y");
    expect(cls).not.toContain("resize-none");
  });

  it("deixa o call site travar o redimensionamento quando precisa", () => {
    render(<Textarea aria-label="Observação" className="resize-none" />);
    expect(screen.getByLabelText("Observação").className).toContain("resize-none");
  });

  it("veste a mesma casca do Input", () => {
    render(<Textarea aria-label="Categorias" />);
    const cls = screen.getByLabelText("Categorias").className;
    expect(cls).toContain("bg-raised");
    expect(cls).toContain("rounded-control");
  });
});
