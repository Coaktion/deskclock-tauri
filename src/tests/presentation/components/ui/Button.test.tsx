import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { Button } from "@presentation/components/ui/Button";

describe("Button", () => {
  it("nasce como `type=button` — dentro de um form, a ausência do atributo vira submit", () => {
    render(<Button onClick={vi.fn()}>Importar</Button>);
    expect(screen.getByRole("button").getAttribute("type")).toBe("button");
  });

  it("o texto é o nome acessível", () => {
    render(<Button onClick={vi.fn()}>Enviar tarefas</Button>);
    expect(screen.getByRole("button", { name: "Enviar tarefas" })).toBeTruthy();
  });

  it("desabilitado não dispara a ação", () => {
    const onClick = vi.fn();
    render(
      <Button onClick={onClick} disabled>
        Desconectar
      </Button>
    );
    screen.getByRole("button").click();
    expect(onClick).not.toHaveBeenCalled();
  });

  it("carregando desabilita e anuncia a espera, sem esperar que quem chama repita o par", () => {
    const onClick = vi.fn();
    render(
      <Button onClick={onClick} loading>
        Sincronizando…
      </Button>
    );
    const button = screen.getByRole("button");
    expect(button.hasAttribute("disabled")).toBe(true);
    expect(button.getAttribute("aria-busy")).toBe("true");
    button.click();
    expect(onClick).not.toHaveBeenCalled();
  });

  it("parado não anuncia espera nenhuma", () => {
    render(<Button onClick={vi.fn()}>Buscar eventos agora</Button>);
    expect(screen.getByRole("button").hasAttribute("aria-busy")).toBe(false);
  });

  it("anuncia o estado quando abre e fecha um bloco — o chevron só o diz a quem enxerga", () => {
    const { rerender } = render(
      <Button onClick={vi.fn()} expanded={false}>
        Filtros
      </Button>
    );
    expect(screen.getByRole("button").getAttribute("aria-expanded")).toBe("false");

    rerender(
      <Button onClick={vi.fn()} expanded>
        Filtros
      </Button>
    );
    expect(screen.getByRole("button").getAttribute("aria-expanded")).toBe("true");
  });

  it("o botão que não abre nada não finge ser um expansor", () => {
    render(<Button onClick={vi.fn()}>Exportar</Button>);
    expect(screen.getByRole("button").hasAttribute("aria-expanded")).toBe(false);
  });

  it("o ícone dá lugar ao spinner enquanto carrega", () => {
    const icon = <svg data-testid="icone" />;
    const { rerender } = render(
      <Button onClick={vi.fn()} icon={icon}>
        Enviar
      </Button>
    );
    expect(screen.queryByTestId("icone")).toBeTruthy();

    rerender(
      <Button onClick={vi.fn()} icon={icon} loading>
        Enviar
      </Button>
    );
    expect(screen.queryByTestId("icone")).toBeNull();
  });
});
