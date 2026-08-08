import { describe, it, expect, beforeEach } from "vitest";
import {
  applyAppearance,
  readAppliedAppearance,
  resolveAppearance,
  MODES,
  ACCENTS,
} from "@shared/utils/theme";

describe("MODES e ACCENTS", () => {
  it("modo tem dois valores e acento tem quatro", () => {
    expect([...MODES]).toEqual(["escuro", "claro"]);
    expect([...ACCENTS]).toEqual(["azul", "verde", "roxo", "ambar"]);
  });
});

describe("resolveAppearance", () => {
  it.each([
    ["azul", { mode: "escuro", accent: "azul" }],
    ["verde", { mode: "escuro", accent: "verde" }],
    ["escuro", { mode: "escuro", accent: "azul" }],
    ["claro", { mode: "claro", accent: "azul" }],
  ])("migra o tema legado %s", (theme, expected) => {
    expect(resolveAppearance({ mode: "", accent: "", theme })).toEqual(expected);
  });

  it("cai no escuro azul sem nada gravado", () => {
    expect(resolveAppearance({})).toEqual({ mode: "escuro", accent: "azul" });
  });

  it("o valor próprio ganha do tema legado", () => {
    expect(resolveAppearance({ mode: "claro", accent: "roxo", theme: "verde" })).toEqual({
      mode: "claro",
      accent: "roxo",
    });
  });

  it("migra eixo a eixo: o acento escolhido não arrasta o modo", () => {
    expect(resolveAppearance({ mode: "", accent: "ambar", theme: "claro" })).toEqual({
      mode: "claro",
      accent: "ambar",
    });
  });

  it("valor desconhecido é tratado como ausente", () => {
    expect(resolveAppearance({ mode: "sepia", accent: "rosa", theme: "verde" })).toEqual({
      mode: "escuro",
      accent: "verde",
    });
  });
});

describe("applyAppearance", () => {
  beforeEach(() => {
    const { dataset } = document.documentElement;
    delete dataset.mode;
    delete dataset.accent;
    delete dataset.theme;
  });

  it("grava os dois eixos", () => {
    applyAppearance({ mode: "claro", accent: "verde" });
    const { dataset } = document.documentElement;
    expect(dataset.mode).toBe("claro");
    expect(dataset.accent).toBe("verde");
  });

  // O CSS legado não existe mais; escrever o atributo agora seria só um resto
  // no DOM, e um resto que alguém acabaria estilizando de novo.
  it("não escreve mais o tema legado", () => {
    applyAppearance({ mode: "claro", accent: "verde" });
    expect(document.documentElement.dataset.theme).toBeUndefined();
  });

  it("readAppliedAppearance devolve o que foi aplicado", () => {
    applyAppearance({ mode: "claro", accent: "ambar" });
    expect(readAppliedAppearance()).toEqual({ mode: "claro", accent: "ambar" });
  });

  it("readAppliedAppearance cai no padrão com o documento limpo", () => {
    expect(readAppliedAppearance()).toEqual({ mode: "escuro", accent: "azul" });
  });
});
