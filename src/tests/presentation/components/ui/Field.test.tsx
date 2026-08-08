import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { Field, fieldControlClass } from "@presentation/components/ui/Field";

describe("Field", () => {
  it("liga o rótulo ao controle, então o campo é encontrado pelo nome", () => {
    render(
      <Field label="Duração" htmlFor="duration">
        <input id="duration" className={fieldControlClass} autoComplete="off" />
      </Field>
    );
    expect(screen.getByLabelText("Duração")).toBeTruthy();
  });
});
