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

  it("sem `pressed`, não se anuncia como alternável", () => {
    render(<IconButton icon={<svg />} title="Editar" onClick={vi.fn()} />);
    expect(screen.getByRole("button").hasAttribute("aria-pressed")).toBe(false);
  });

  it("com `pressed`, anuncia o estado nos dois sentidos", () => {
    const { rerender } = render(
      <IconButton icon={<svg />} title="Ações" onClick={vi.fn()} pressed={false} />
    );
    expect(screen.getByRole("button").getAttribute("aria-pressed")).toBe("false");
    rerender(<IconButton icon={<svg />} title="Ações" onClick={vi.fn()} pressed />);
    expect(screen.getByRole("button", { pressed: true })).toBeTruthy();
  });

  it("desenha o ícone que recebe", () => {
    render(<IconButton icon={<svg data-testid="lixeira" />} title="Excluir" onClick={vi.fn()} />);
    expect(screen.getByTestId("lixeira")).toBeTruthy();
  });

  /**
   * A única variante com cor em repouso — o ▶ da planejada. As outras nascem
   * `fg-muted` e só o hover diz o destino.
   */
  it("`primary` tem acento em repouso, sem fundo, e o hover suave do `accent`", () => {
    render(<IconButton icon={<svg />} title="Iniciar" variant="primary" />);
    const classes = screen.getByRole("button").className.split(/\s+/);

    expect(classes).toEqual(expect.arrayContaining(["text-accent-text", "hover:bg-accent/10"]));
    expect(classes).not.toContain("text-fg-muted");
    expect(classes.some((c) => /^bg-/.test(c))).toBe(false);
  });

  it("`primary` desabilitado perde o acento e se lê como bloqueado", () => {
    render(<IconButton icon={<svg />} title="Iniciar" variant="primary" disabled />);
    const classes = screen.getByRole("button").className.split(/\s+/);

    expect(classes.some((c) => c.includes("accent"))).toBe(false);
    expect(classes).toEqual(
      expect.arrayContaining([
        "text-fg-muted",
        "disabled:opacity-40",
        "disabled:cursor-not-allowed",
      ])
    );
  });
});
