import { describe, it, expect, beforeEach } from "vitest";
import { applyTheme, THEMES } from "@shared/utils/theme";

describe("THEMES", () => {
  it("contém os quatro temas esperados", () => {
    expect(THEMES).toContain("azul");
    expect(THEMES).toContain("verde");
    expect(THEMES).toContain("escuro");
    expect(THEMES).toContain("claro");
  });
});

describe("applyTheme", () => {
  beforeEach(() => {
    delete document.documentElement.dataset.theme;
  });

  it("define data-theme=verde no documentElement", () => {
    applyTheme("verde");
    expect(document.documentElement.dataset.theme).toBe("verde");
  });

  it("define data-theme=escuro no documentElement", () => {
    applyTheme("escuro");
    expect(document.documentElement.dataset.theme).toBe("escuro");
  });

  it("define data-theme=claro no documentElement", () => {
    applyTheme("claro");
    expect(document.documentElement.dataset.theme).toBe("claro");
  });

  it("tema azul remove o atributo data-theme (usa o padrão CSS)", () => {
    applyTheme("verde");
    applyTheme("azul");
    expect(document.documentElement.dataset.theme).toBeUndefined();
  });
});
