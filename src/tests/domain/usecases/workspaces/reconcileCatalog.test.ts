import { describe, it, expect } from "vitest";
import { reconcileCatalog } from "@domain/usecases/workspaces/reconcileCatalog";

const destino = [
  { id: "dst-1", name: "Projeto Alfa" },
  { id: "dst-2", name: "Projeto Beta" },
];

describe("reconcileCatalog", () => {
  it("propõe match quando o destino tem item de mesmo nome", () => {
    expect(reconcileCatalog("Projeto Beta", destino)).toEqual({ kind: "match", targetId: "dst-2" });
  });

  it("ignora caixa e espaços ao casar o nome", () => {
    expect(reconcileCatalog("  projeto BETA ", destino)).toEqual({
      kind: "match",
      targetId: "dst-2",
    });
  });

  it("propõe create quando o destino não tem o nome", () => {
    expect(reconcileCatalog("Projeto Gama", destino)).toEqual({
      kind: "create",
      name: "Projeto Gama",
    });
  });

  it("propõe create com o nome já aparado", () => {
    expect(reconcileCatalog("  Projeto Gama  ", destino)).toEqual({
      kind: "create",
      name: "Projeto Gama",
    });
  });

  it("propõe unset quando a origem não tem projeto/categoria", () => {
    expect(reconcileCatalog(null, destino)).toEqual({ kind: "unset" });
    expect(reconcileCatalog(undefined, destino)).toEqual({ kind: "unset" });
    expect(reconcileCatalog("   ", destino)).toEqual({ kind: "unset" });
  });

  it("propõe create quando o catálogo de destino está vazio", () => {
    expect(reconcileCatalog("Projeto Alfa", [])).toEqual({ kind: "create", name: "Projeto Alfa" });
  });
});
