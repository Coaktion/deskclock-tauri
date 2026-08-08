import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { Select } from "@presentation/components/ui/Select";

describe("Select", () => {
  it("desenha a própria seta e esconde a do sistema — as duas juntas apareceriam lado a lado", () => {
    const { container } = render(
      <Select aria-label="Workspace">
        <option value="a">A</option>
      </Select>
    );
    expect(screen.getByLabelText("Workspace").className).toContain("appearance-none");
    expect(container.querySelector("svg[aria-hidden]")).toBeTruthy();
  });

  it("a seta não é anunciada nem clicável — o campo continua sendo o alvo", () => {
    const { container } = render(
      <Select aria-label="Formato">
        <option value="csv">CSV</option>
      </Select>
    );
    const arrow = container.querySelector("svg");
    expect(arrow?.getAttribute("aria-hidden")).toBe("true");
    expect(arrow?.getAttribute("class")).toContain("pointer-events-none");
  });

  it("a largura vai no invólucro, não no campo — é o invólucro que ocupa a linha", () => {
    const { container } = render(
      <Select aria-label="Perfil" className="max-w-[180px]">
        <option value="p">P</option>
      </Select>
    );
    expect(container.firstElementChild?.className).toContain("max-w-[180px]");
    expect(screen.getByLabelText("Perfil").className).toContain("w-full");
  });
});
