import { describe, it, expect } from "vitest";
import { emptyResultMessage } from "@presentation/sections/history/emptyResultMessage";

describe("emptyResultMessage", () => {
  it("no 'Último trabalhado', diz por que está vazio", () => {
    expect(emptyResultMessage("lastDay")).toBe("Nenhum dia trabalhado antes de hoje");
  });

  it("nos demais filtros, mantém a mensagem genérica", () => {
    for (const quick of ["today", "7days", "30days", "month", "custom"] as const) {
      expect(emptyResultMessage(quick)).toBe("Nenhum registro encontrado");
    }
  });
});
