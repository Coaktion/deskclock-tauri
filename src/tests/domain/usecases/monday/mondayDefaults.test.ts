import { describe, it, expect } from "vitest";
import {
  MONDAY_DEFAULT_CLIENTS_FOLDER_ID,
  MONDAY_DEFAULT_INTERNAL_FOLDER_ID,
  MONDAY_DEFAULT_WORKSPACE_ID,
  pickDefaultFolders,
  pickDefaultWorkspace,
} from "@domain/usecases/monday/mondayDefaults";

describe("pickDefaultWorkspace", () => {
  it("escolhe o workspace padrão quando ele está na lista", () => {
    const workspaces = [
      { id: "999", name: "Outro" },
      { id: MONDAY_DEFAULT_WORKSPACE_ID, name: "Delivery Center" },
    ];
    expect(pickDefaultWorkspace(workspaces)?.id).toBe(MONDAY_DEFAULT_WORKSPACE_ID);
  });

  it("cai no primeiro workspace quando o padrão não existe na conta", () => {
    const workspaces = [
      { id: "999", name: "Outro" },
      { id: "888", name: "Mais outro" },
    ];
    expect(pickDefaultWorkspace(workspaces)?.id).toBe("999");
  });

  it("devolve null sem workspace nenhum", () => {
    expect(pickDefaultWorkspace([])).toBeNull();
  });
});

describe("pickDefaultFolders", () => {
  it("escolhe as duas pastas padrão quando ambas estão na lista", () => {
    const folders = [
      { id: MONDAY_DEFAULT_CLIENTS_FOLDER_ID, name: "Projetos" },
      { id: MONDAY_DEFAULT_INTERNAL_FOLDER_ID, name: "Projetos Internos" },
      { id: "1", name: "Arquivo" },
    ];
    expect(pickDefaultFolders(folders)).toEqual({
      clientsFolderId: MONDAY_DEFAULT_CLIENTS_FOLDER_ID,
      internalFolderId: MONDAY_DEFAULT_INTERNAL_FOLDER_ID,
    });
  });

  it("deixa vazia a pasta que a API não devolveu", () => {
    const folders = [{ id: MONDAY_DEFAULT_CLIENTS_FOLDER_ID, name: "Projetos" }];
    expect(pickDefaultFolders(folders)).toEqual({
      clientsFolderId: MONDAY_DEFAULT_CLIENTS_FOLDER_ID,
      internalFolderId: "",
    });
  });

  it("não inventa id quando a conta não tem nenhuma das pastas", () => {
    expect(pickDefaultFolders([{ id: "1", name: "Arquivo" }])).toEqual({
      clientsFolderId: "",
      internalFolderId: "",
    });
  });
});
