import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { Badge } from "@presentation/components/ui/Badge";

describe("Badge", () => {
  it("não é clicável — quem responde ao clique é FilterPill ou Button", () => {
    const { container } = render(<Badge>Enviado</Badge>);
    expect(screen.getByText("Enviado")).toBeTruthy();
    expect(container.querySelector("button")).toBeNull();
  });

  it("sem icon não desenha nada além do texto", () => {
    const { container } = render(<Badge>Billable</Badge>);
    expect(container.querySelector("svg")).toBeNull();
  });

  it("o ícone vem antes do texto, e não no lugar dele", () => {
    const { container } = render(
      <Badge tone="warning" icon={<svg data-testid="alerta" />}>
        Parcial
      </Badge>
    );
    const badge = container.firstElementChild as HTMLElement;
    expect(badge.firstElementChild?.tagName.toLowerCase()).toBe("svg");
    expect(badge.textContent).toBe("Parcial");
  });

  it("o title explica o rótulo abreviado", () => {
    render(<Badge title="Veio da varredura do Monday">Monday</Badge>);
    expect(screen.getByTitle("Veio da varredura do Monday").textContent).toBe("Monday");
  });
});
