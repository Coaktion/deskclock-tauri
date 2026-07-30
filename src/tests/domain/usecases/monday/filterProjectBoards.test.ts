import { describe, it, expect } from "vitest";
import { filterProjectBoards } from "@domain/usecases/monday/filterProjectBoards";
import type { MondayBoardRef } from "@shared/types/monday";

const FOLDER = "20715906";

function board(overrides: Partial<MondayBoardRef>): MondayBoardRef {
  return {
    id: "1",
    name: "[BR] Cliente Produto 01-999",
    folderId: FOLDER,
    state: "active",
    ...overrides,
  };
}

describe("filterProjectBoards", () => {
  it("mantém boards ativos da pasta de projetos", () => {
    const result = filterProjectBoards([board({ id: "1" })], FOLDER);
    expect(result.map((b) => b.id)).toEqual(["1"]);
  });

  it("exclui cópias de template", () => {
    const boards = [
      board({ id: "1" }),
      board({ id: "2", name: "Template de Projeto - Pacote até 60h" }),
      board({ id: "3", name: "Template 12h a 20h" }),
    ];
    expect(filterProjectBoards(boards, FOLDER).map((b) => b.id)).toEqual(["1"]);
  });

  it("exclui boards de subitens em inglês e em português", () => {
    const boards = [
      board({ id: "1" }),
      board({ id: "2", name: "Subitems of Projeto X", folderId: null }),
      board({ id: "3", name: "Subelementos de Projeto X", folderId: null }),
    ];
    expect(filterProjectBoards(boards).map((b) => b.id)).toEqual(["1"]);
  });

  it("exclui boards arquivados", () => {
    const boards = [board({ id: "1" }), board({ id: "2", state: "archived" })];
    expect(filterProjectBoards(boards, FOLDER).map((b) => b.id)).toEqual(["1"]);
  });

  it("exclui boards de outra pasta quando a pasta é conhecida", () => {
    const boards = [board({ id: "1" }), board({ id: "2", folderId: "999" })];
    expect(filterProjectBoards(boards, FOLDER).map((b) => b.id)).toEqual(["1"]);
  });

  it("ignora o filtro de pasta quando ela não foi resolvida", () => {
    const boards = [board({ id: "1", folderId: null }), board({ id: "2", folderId: "999" })];
    expect(filterProjectBoards(boards).map((b) => b.id)).toEqual(["1", "2"]);
  });
});
