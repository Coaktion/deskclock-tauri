import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { CompleteToggle } from "@presentation/components/ui/CompleteToggle";

afterEach(cleanup);

describe("CompleteToggle", () => {
  it("pendente, anuncia Concluir e não está pressionado", () => {
    render(<CompleteToggle completed={false} onToggle={() => {}} />);
    const botao = screen.getByRole("button", { name: "Concluir" });
    expect(botao.getAttribute("aria-pressed")).toBe("false");
    expect(botao.getAttribute("title")).toBe("Concluir");
    expect(botao.getAttribute("type")).toBe("button");
    expect(botao.querySelector("svg")).toBeNull();
  });

  it("concluído, anuncia Marcar como pendente, está pressionado e leva o ✓", () => {
    render(<CompleteToggle completed onToggle={() => {}} />);
    const botao = screen.getByRole("button", { name: "Marcar como pendente" });
    expect(botao.getAttribute("aria-pressed")).toBe("true");
    expect(botao.querySelector("svg")).toBeTruthy();
    // O tom é o contrato do estado: cheio no acento, com o ✓ branco.
    expect(botao.className.split(/\s+/)).toEqual(
      expect.arrayContaining(["bg-accent", "text-white"])
    );
  });

  it("alterna e não deixa o clique chegar à linha", () => {
    const onToggle = vi.fn();
    const linha = vi.fn();
    render(
      <div onClick={linha}>
        <CompleteToggle completed={false} onToggle={onToggle} />
      </div>
    );
    fireEvent.click(screen.getByRole("button"));
    expect(onToggle).toHaveBeenCalledTimes(1);
    expect(linha).not.toHaveBeenCalled();
  });
});
