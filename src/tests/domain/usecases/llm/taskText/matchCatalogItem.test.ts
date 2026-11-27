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
