import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { ExecutionDot } from "@presentation/components/ui/ExecutionDot";

describe("ExecutionDot", () => {
  /**
   * O pulso é o que separa os dois estados. Pintados do mesmo jeito eles seriam
   * um só, e o ponto passaria a dizer apenas "há uma execução" — que é
   * exatamente o que o usuário já sabe ao olhar o cronômetro.
   */
  it("em execução, o ponto pulsa no tom do acento", () => {
    render(<ExecutionDot execution="running" />);
    const ponto = screen.getByTitle("Em execução");

    expect(ponto.className).toContain("animate-pulse");
    expect(ponto.className).toContain("bg-accent");
  });

  it("pausada, o ponto não pulsa e tem tom próprio", () => {
    render(<ExecutionDot execution="paused" />);
    const ponto = screen.getByTitle("Pausada");

    expect(ponto.className).not.toContain("animate-pulse");
    expect(ponto.className).toContain("bg-paused");
  });

  /**
   * Sem texto ao lado, o `title` é a única coisa que anuncia o estado a quem não
   * vê a cor — e era o que faltava na cópia da barra de título. As duas redações
   * moram aqui porque eram três call sites e já havia duas ("Rodando" num deles).
   */
  it("cada estado anuncia o próprio nome, e há um nome só para cada", () => {
    const { rerender } = render(<ExecutionDot execution="running" />);
    expect(screen.queryByTitle("Rodando")).toBeNull();
    expect(screen.queryByTitle("Pausada")).toBeNull();

    rerender(<ExecutionDot execution="paused" />);
    expect(screen.queryByTitle("Em execução")).toBeNull();
  });
});
