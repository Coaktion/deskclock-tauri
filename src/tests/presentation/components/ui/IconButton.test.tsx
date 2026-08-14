import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { IconButton } from "@presentation/components/ui/IconButton";

describe("IconButton", () => {
  it("o `title` é o nome acessível — sem texto, é a única coisa que o botão anuncia", () => {
    render(<IconButton icon={<svg />} title="Excluir" onClick={vi.fn()} />);
    const button = screen.getByRole("button", { name: "Excluir" });
    expect(button.getAttribute("title")).toBe("Excluir");
  });

  it("nasce como `type=button`", () => {
    render(<IconButton icon={<svg />} title="Editar" onClick={vi.fn()} />);
    expect(screen.getByRole("button").getAttribute("type")).toBe("button");
  });

  it("desabilitado não dispara a ação", () => {
    const onClick = vi.fn();
    render(<IconButton icon={<svg />} title="Dia seguinte" onClick={onClick} disabled />);
    screen.getByRole("button").click();
    expect(onClick).not.toHaveBeenCalled();
  });

  it("desenha o ícone que recebe", () => {
    render(<IconButton icon={<svg data-testid="lixeira" />} title="Excluir" onClick={vi.fn()} />);
    expect(screen.getByTestId("lixeira")).toBeTruthy();
  });
});
