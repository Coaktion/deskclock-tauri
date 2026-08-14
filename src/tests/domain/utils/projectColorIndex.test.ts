import { describe, expect, it } from "vitest";
import { nextProjectColorIndex } from "@domain/utils/projectColorIndex";
import type { Project } from "@domain/entities/Project";

function projeto(colorIndex: number): Project {
  return {
    id: `p-${colorIndex}`,
    workspaceId: "ws-1",
    name: `Projeto ${colorIndex}`,
    colorIndex,
  };
}

describe("nextProjectColorIndex", () => {
  it("começa em 0 no workspace vazio", () => {
    expect(nextProjectColorIndex([])).toBe(0);
  });

  it("segue a sequência enquanto ela estiver cheia", () => {
    expect(nextProjectColorIndex([0, 1, 2].map(projeto))).toBe(3);
  });

  it("reaproveita o buraco que um projeto excluído deixou", () => {
    // É o caso que separa "o menor livre" de "o próximo": com `max + 1`, um
    // ciclo de criar e excluir empurraria o índice para cima até dar a volta na
    // paleta, e o catálogo passaria a repetir cor com slots vagos sobrando.
    expect(nextProjectColorIndex([0, 1, 3, 4].map(projeto))).toBe(2);
  });

  it("ignora a ordem da lista", () => {
    expect(nextProjectColorIndex([4, 0, 3, 1].map(projeto))).toBe(2);
  });

  it("passa do fim da paleta em vez de parar nela", () => {
    // O índice cru é o que faz a cor sobreviver a uma paleta que cresce ou
    // encolhe: quem dá a volta é a apresentação, com `índice % 24`.
    const cheia = Array.from({ length: 24 }, (_, i) => projeto(i));
    expect(nextProjectColorIndex(cheia)).toBe(24);
  });
});
