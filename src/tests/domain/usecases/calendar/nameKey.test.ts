import { describe, it, expect } from "vitest";
import { nameKey } from "@domain/usecases/calendar/nameKey";

describe("nameKey", () => {
  it("normaliza caixa e espaço nas pontas", () => {
    expect(nameKey("  Daily  ")).toBe("daily");
    expect(nameKey("DAILY")).toBe(nameKey("daily"));
  });

  // As duas asserções abaixo protegem uma decisão, não uma implementação: o
  // casamento é exato de propósito (§5.7), e "melhorar" a normalização faria a
  // reunião casar com o trabalho errado num job de fundo, sem ninguém conferir.
  it("NÃO remove acentos — 'Reunião' e 'Reuniao' são nomes diferentes", () => {
    expect(nameKey("Reunião")).not.toBe(nameKey("Reuniao"));
  });

  it("NÃO colapsa espaço interno — 'Daily  Squad' e 'Daily Squad' são diferentes", () => {
    expect(nameKey("Daily  Squad")).not.toBe(nameKey("Daily Squad"));
  });
});
