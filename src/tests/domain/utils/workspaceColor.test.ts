import { describe, it, expect } from "vitest";
import {
  WORKSPACE_COLORS,
  workspaceColorFor,
  isWorkspaceColor,
} from "@domain/utils/workspaceColor";

describe("workspaceColorFor", () => {
  it("devolve sempre a mesma cor para o mesmo nome", () => {
    expect(workspaceColorFor("Aktie Now")).toBe(workspaceColorFor("Aktie Now"));
  });

  it("devolve uma cor da paleta curada", () => {
    for (const name of ["Padrão", "Pessoal", "Cliente A", "Estudos", "", "x"]) {
      expect(WORKSPACE_COLORS).toContain(workspaceColorFor(name));
    }
  });

  it("ignora espaços em volta do nome", () => {
    expect(workspaceColorFor("  Pessoal  ")).toBe(workspaceColorFor("Pessoal"));
  });

  it("mantém a cor do workspace semeado pela migration 011", () => {
    // O seed de 011_workspaces.sql grava 'amber' para "Padrão". Se este teste
    // quebrar, a migration e o código deixaram de concordar.
    expect(workspaceColorFor("Padrão")).toBe("amber");
  });

  it("não usa os accents de tema nem os neutros", () => {
    for (const reserved of ["blue", "green", "gray", "zinc", "slate", "neutral", "stone"]) {
      expect(WORKSPACE_COLORS).not.toContain(reserved);
    }
  });
});

describe("isWorkspaceColor", () => {
  it("reconhece um slot da paleta", () => {
    expect(isWorkspaceColor("teal")).toBe(true);
  });

  it("rejeita valor fora da paleta", () => {
    expect(isWorkspaceColor("ws-slate")).toBe(false);
    expect(isWorkspaceColor("#ff0000")).toBe(false);
  });
});
