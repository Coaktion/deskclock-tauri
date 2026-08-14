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
    render(
      <Field label="Início" htmlFor="start">
        <Input id="start" variant="bare" />
      </Field>
    );
    const caixa = screen.getByLabelText("Início").parentElement!;
    expect(caixa.className).toContain("border-border");
    expect(screen.getByLabelText("Início").className).toContain("border-none");
  });

  /**
   * O `className` veste o bloco (lugar na linha) e o `boxClassName` veste a
   * caixa (arranjo de quem divide a linha com o controle). Trocados, o `flex-1`
   * não chega à linha e o `items-center` não chega à caixa — e nenhum dos dois
   * erra de um jeito que apareça sem medir.
   */
  it("separa o que veste o bloco do que veste a caixa", () => {
    const { container } = render(
      <Field label="Fim" htmlFor="end" className="flex-1" boxClassName="flex items-center">
        <Input id="end" variant="bare" />
      </Field>
    );
    const bloco = container.firstElementChild!;
    expect(bloco.className).toContain("flex-1");
    expect(bloco.className).not.toContain("items-center");
    expect(screen.getByLabelText("Fim").parentElement!.className).toContain("items-center");
  });
});
