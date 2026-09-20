import type { MouseEvent } from "react";
import { describe, expect, it } from "vitest";
import { titleWhenTruncated } from "@presentation/components/ui/titleWhenTruncated";

/**
 * O jsdom não faz layout: `scrollWidth` e `clientWidth` são 0 em todo elemento.
 * Testar isto pela árvore renderizada seria testar o stub, então o elemento
 * aqui é o mínimo que o handler toca — as duas medidas e os dois métodos de
 * atributo —, e o que se afirma é a decisão, que é toda a lógica que existe.
 */
function elementoCom(scrollWidth: number, clientWidth: number) {
  const el = document.createElement("p");
  el.textContent = "Reunião de alinhamento do trimestre com o time de produto";
  Object.defineProperty(el, "scrollWidth", { value: scrollWidth });
  Object.defineProperty(el, "clientWidth", { value: clientWidth });
  return el;
}

function entra(el: HTMLElement, fallback?: string) {
  titleWhenTruncated(fallback)({ currentTarget: el } as MouseEvent<HTMLElement>);
}

describe("titleWhenTruncated", () => {
  it("o nome cortado vira dica com o texto inteiro", () => {
    const el = elementoCom(420, 190);
    entra(el);
    expect(el.title).toBe("Reunião de alinhamento do trimestre com o time de produto");
  });

  it("o nome que cabe não ganha dica nenhuma — balão sobre o que já se lê é ruído", () => {
    const el = elementoCom(120, 190);
    entra(el);
    expect(el.hasAttribute("title")).toBe(false);
  });

  it("a dica some quando a linha alarga e o nome passa a caber", () => {
    const el = elementoCom(420, 190);
    entra(el);

    const largo = elementoCom(120, 190);
    largo.title = el.title;
    entra(largo);
    expect(largo.hasAttribute("title")).toBe(false);
  });

  it("com fallback, a dica de ação volta no lugar em vez de sumir", () => {
    const cabe = elementoCom(120, 190);
    entra(cabe, "Editar tarefa");
    expect(cabe.title).toBe("Editar tarefa");

    const corta = elementoCom(420, 190);
    entra(corta, "Editar tarefa");
    expect(corta.title).toBe("Reunião de alinhamento do trimestre com o time de produto");
  });
});
