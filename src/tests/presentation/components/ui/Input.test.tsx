import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { Input } from "@presentation/components/ui/Input";

describe("Input", () => {
  it("desliga o autofill sem o call site precisar lembrar", () => {
    render(<Input aria-label="Nome" />);
    expect(screen.getByLabelText("Nome").getAttribute("autocomplete")).toBe("off");
  });

  it("aceita o autofill de volta quando o call site pede", () => {
    render(<Input aria-label="Senha" autoComplete="current-password" />);
    expect(screen.getByLabelText("Senha").getAttribute("autocomplete")).toBe("current-password");
  });

  it("no bare não desenha casca — quem a desenha é o Field em volta", () => {
    render(<Input aria-label="Duração" variant="bare" />);
    const cls = screen.getByLabelText("Duração").className;
    expect(cls).toContain("bg-transparent");
    expect(cls).not.toContain("border-border");
  });

  it("marca a borda de erro só onde há borda própria", () => {
    const { rerender } = render(<Input aria-label="Fim" invalid />);
    expect(screen.getByLabelText("Fim").className).toContain("border-danger");

    rerender(<Input aria-label="Fim" invalid variant="bare" />);
    expect(screen.getByLabelText("Fim").className).not.toContain("border-danger");
  });

  it("encaminha a ref, que é o que Autocomplete e DatePickerInput precisam", () => {
    let node: HTMLInputElement | null = null;
    render(
      <Input
        aria-label="Projeto"
        ref={(el) => {
          node = el;
        }}
      />
    );
    expect(node).toBe(screen.getByLabelText("Projeto"));
  });
});
