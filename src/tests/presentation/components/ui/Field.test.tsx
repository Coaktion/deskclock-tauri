import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { Field } from "@presentation/components/ui/Field";
import { Input } from "@presentation/components/ui/Input";

describe("Field", () => {
  it("liga o rótulo ao controle, então o campo é encontrado pelo nome", () => {
    render(
      <Field label="Duração" htmlFor="duration">
        <Input id="duration" variant="bare" />
      </Field>
    );
    expect(screen.getByLabelText("Duração")).toBeTruthy();
  });

  it("é a caixa que desenha a borda — o controle dentro dela não tem casca", () => {
    const { container } = render(
      <Field label="Início" htmlFor="start">
        <Input id="start" variant="bare" />
      </Field>
    );
    expect(container.firstElementChild?.className).toContain("border-border");
    expect(screen.getByLabelText("Início").className).toContain("border-none");
  });
});
