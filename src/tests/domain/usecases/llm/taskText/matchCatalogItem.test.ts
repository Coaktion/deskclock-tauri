import { describe, it, expect } from "vitest";
import { matchCatalogItem, matchesStrictly } from "@domain/usecases/llm/taskText/matchCatalogItem";

const ITEMS = [
  { id: "p-ptg", label: "[US] Pinecrest Travel Group Zendesk" },
  { id: "p-cx", label: "CX Atividades Internas" },
];

describe("matchesStrictly", () => {
  it("aceita igualdade sem acento nem caixa", () => {
    expect(matchesStrictly("cx atividades internas", ITEMS)).toBe(true);
  });

  it("aceita prefixo de palavras na ordem", () => {
    expect(matchesStrictly("Pinecrest Travel", ITEMS)).toBe(true);
    expect(matchesStrictly("cx ativ", ITEMS)).toBe(true);
  });

  it("recusa o que só o fuzzy casaria", () => {
    expect(matchCatalogItem("pgz", ITEMS).kind).not.toBe("notFound");
    expect(matchesStrictly("pgz", ITEMS)).toBe(false);
  });

  it("recusa texto vazio ou só pontuação", () => {
    expect(matchesStrictly("", ITEMS)).toBe(false);
    expect(matchesStrictly(" -/ ", ITEMS)).toBe(false);
  });
});

describe("flexão do português", () => {
  const CATEGORIES = [
    { id: "c-reun", label: "Reuniões internas" },
    { id: "c-pausa", label: "Intervalo" },
    { id: "c-dev", label: "Devolução" },
  ];

  it("casa masculino e singular com o plural e o feminino do catálogo", () => {
    expect(matchCatalogItem("reunião interna", CATEGORIES)).toEqual({
      kind: "resolved",
      item: CATEGORIES[0],
    });
    expect(matchesStrictly("reuniao interno", CATEGORIES)).toBe(true);
    expect(matchesStrictly("cx atividade interna", ITEMS)).toBe(true);
  });

  it("raiz comum não basta quando o alvo sobra demais: interno não é intervalo", () => {
    expect(matchesStrictly("interno", [CATEGORIES[1]])).toBe(false);
    expect(matchCatalogItem("interno", [CATEGORIES[1]]).kind).toBe("notFound");
  });

  it("palavra curta só casa por prefixo", () => {
    expect(matchesStrictly("dev", [CATEGORIES[2]])).toBe(true);
    expect(matchesStrictly("deve", [CATEGORIES[2]])).toBe(false);
  });

  it("as palavras continuam exigidas todas e na ordem", () => {
    expect(matchesStrictly("internas reunioes", CATEGORIES)).toBe(false);
    expect(matchesStrictly("reuniao externa", CATEGORIES)).toBe(false);
  });
});
