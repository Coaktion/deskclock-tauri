import { describe, it, expect } from "vitest";
import { selectImportBoards } from "@domain/usecases/monday/selectImportBoards";
import type { MondayBoardRef } from "@shared/types/monday";

const CLIENTS = "20715906";
const INTERNAL = "30715907";

function board(overrides: Partial<MondayBoardRef> = {}): MondayBoardRef {
  return {
    id: "b1",
    name: "[BR] Cliente Produto 01-999",
    folderId: CLIENTS,
    state: "active",
    ...overrides,
  };
}

describe("selectImportBoards", () => {
  it("devolve todos os boards da pasta de clientes", () => {
    const boards = [board({ id: "b1" }), board({ id: "b2", name: "[BR] Outro" })];

    const selected = selectImportBoards(boards, { clientsFolderId: CLIENTS });

    expect(selected.map((b) => b.id)).toEqual(["b1", "b2"]);
  });

  it("acrescenta o board interno vinculado, e só ele", () => {
    const boards = [
      board({ id: "b1" }),
      board({ id: "int-1", name: "Tech Atividades Internas", folderId: INTERNAL }),
      board({ id: "int-2", name: "Design Atividades Internas", folderId: INTERNAL }),
    ];

    const selected = selectImportBoards(boards, {
      clientsFolderId: CLIENTS,
      internalFolderId: INTERNAL,
      internalBoardId: "int-1",
    });

    expect(selected.map((b) => b.id)).toEqual(["b1", "int-1"]);
  });

  it("mantém a pasta interna fora quando não há pasta de clientes escolhida", () => {
    const boards = [
      board({ id: "b1", folderId: null }),
      board({ id: "int-1", name: "Tech Atividades Internas", folderId: INTERNAL }),
      board({ id: "int-2", name: "Design Atividades Internas", folderId: INTERNAL }),
    ];

    const selected = selectImportBoards(boards, {
      internalFolderId: INTERNAL,
      internalBoardId: "int-2",
    });

    expect(selected.map((b) => b.id)).toEqual(["b1", "int-2"]);
  });

  it("não duplica o board interno quando ele já entrou pela pasta de clientes", () => {
    const boards = [board({ id: "b1" })];

    const selected = selectImportBoards(boards, {
      clientsFolderId: CLIENTS,
      internalBoardId: "b1",
    });

    expect(selected.map((b) => b.id)).toEqual(["b1"]);
  });

  it("ignora vínculo para board arquivado ou inexistente", () => {
    const boards = [
      board({ id: "b1" }),
      board({ id: "int-1", folderId: INTERNAL, state: "archived" }),
    ];

    const selected = selectImportBoards(boards, {
      clientsFolderId: CLIENTS,
      internalFolderId: INTERNAL,
      internalBoardId: "int-1",
    });

    expect(selected.map((b) => b.id)).toEqual(["b1"]);
  });

  it("aceita board interno de outra pasta quando não há pasta interna escolhida", () => {
    const boards = [board({ id: "b1" }), board({ id: "avulso", folderId: "outra" })];

    const selected = selectImportBoards(boards, {
      clientsFolderId: CLIENTS,
      internalBoardId: "avulso",
    });

    expect(selected.map((b) => b.id)).toEqual(["b1", "avulso"]);
  });

  it("descarta template e subitens também no board interno", () => {
    const boards = [
      board({ id: "int-1", name: "Template de Atividades Internas", folderId: INTERNAL }),
    ];

    const selected = selectImportBoards(boards, {
      internalFolderId: INTERNAL,
      internalBoardId: "int-1",
    });

    expect(selected).toEqual([]);
  });
});
