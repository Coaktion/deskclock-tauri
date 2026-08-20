import { describe, it, expect } from "vitest";
import { measureListBox } from "@presentation/components/Autocomplete";

// Retângulo do campo: só as três medidas que a regra usa.
function rect(left: number, width: number) {
  return { left, right: left + width, width };
}

describe("measureListBox", () => {
  it("campo estreito ganha muito mais espaço que a própria largura", () => {
    // Campo de 120 px à esquerda de uma janela de 1200: a lista pode crescer
    // até o teto, em vez de ficar presa aos 120 do campo.
    expect(measureListBox(rect(40, 120), 1200)).toEqual({ maxWidth: 384, alignRight: false });
  });

  it("perto da borda direita, o espaço restante é o limite", () => {
    // Campo terminando em 1180 de 1200: cabem 1200 − 900 − 8 = 292.
    expect(measureListBox(rect(900, 280), 1200)).toEqual({ maxWidth: 292, alignRight: false });
  });

  it("sem espaço à direita, a lista cresce para a esquerda", () => {
    // Restam 1200 − 1050 − 8 = 142 à direita, abaixo do confortável; à esquerda
    // há 1180 − 8, então ela vira e o teto volta a valer.
    expect(measureListBox(rect(1050, 130), 1200)).toEqual({ maxWidth: 384, alignRight: true });
  });

  it("espaço apertado dos dois lados não vira a lista", () => {
    // Janela do popup (264 px úteis): virar não ganharia nada, e o alinhamento à
    // esquerda é o padrão.
    expect(measureListBox(rect(16, 110), 280)).toEqual({ maxWidth: 256, alignRight: false });
  });

  it("virando, o limite é o espaço à esquerda, não o teto", () => {
    expect(measureListBox(rect(200, 60), 280)).toEqual({ maxWidth: 252, alignRight: true });
  });

  it("nunca fica mais estreita que o próprio campo", () => {
    // Campo que ocupa quase toda a janela do popup e passa da folga de 8 px: o
    // espaço medido (286) é menor que ele, e a lista acompanha o campo em vez de
    // encolher e desalinhar as bordas.
    expect(measureListBox(rect(6, 290), 300)).toEqual({ maxWidth: 290, alignRight: false });
  });
});
