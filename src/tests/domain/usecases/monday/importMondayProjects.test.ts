import { describe, it, expect, vi, beforeEach } from "vitest";
import { importMondayProjects } from "@domain/usecases/monday/importMondayProjects";
import type { IMondayApi } from "@domain/integrations/IMondayApi";
import type { IProjectRepository } from "@domain/repositories/IProjectRepository";
import type { MondayBoardRef, MondayBoardSchema } from "@shared/types/monday";

const WORKSPACE_ID = "15505674";
const FOLDER_ID = "20715906";

function board(overrides: Partial<MondayBoardRef> = {}): MondayBoardRef {
  return {
    id: "b1",
    name: "[BR] Cliente Produto 01-999",
    folderId: FOLDER_ID,
    state: "active",
    ...overrides,
  };
}

function schema(overrides: Partial<MondayBoardSchema> = {}): MondayBoardSchema {
  return {
    id: "b1",
    name: "[BR] Cliente Produto 01-999",
    groups: [{ id: "group_mm2e2g9j", title: "Activities" }],
    columns: [
      { id: "numeric_mm33gj5m", title: "Reported Hours", type: "numbers" },
      { id: "color_mm33rxm7", title: "Billing type", type: "status" },
      { id: "color_mm19csp3", title: "Activity Type", type: "status" },
      { id: "status", title: "Status", type: "status" },
      { id: "person", title: "Owner", type: "people" },
    ],
    views: [{ id: "v1", name: "Activities", type: "table" }],
    ...overrides,
  };
}

function makeApi(boards: MondayBoardRef[], schemas: Record<string, MondayBoardSchema>): IMondayApi {
  return {
    getMe: vi.fn(),
    listWorkspaces: vi.fn(),
    listFolders: vi.fn(),
    listBoards: vi.fn(async () => boards),
    getBoardSchema: vi.fn(async (id: string) => {
      const found = schemas[id];
      if (!found) throw new Error(`Board ${id} não encontrado no Monday.`);
      return found;
    }),
    createItem: vi.fn(),
    changeColumnValues: vi.fn(),
    deleteItem: vi.fn(),
  };
}

function makeProjectRepo(existing: { id: string; name: string }[] = []): IProjectRepository {
  const store = [...existing];
  return {
    findAll: vi.fn(async () => store),
    findByName: vi.fn(async (name: string) => store.find((p) => p.name === name) ?? null),
    save: vi.fn(async (project) => {
      store.push(project);
    }),
    update: vi.fn(),
    delete: vi.fn(),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("importMondayProjects", () => {
  it("cria um projeto por board e cacheia o schema resolvido", async () => {
    const api = makeApi([board()], { b1: schema() });
    const projectRepo = makeProjectRepo();

    const result = await importMondayProjects({
      api,
      projectRepo,
      workspaceId: WORKSPACE_ID,
      folderId: FOLDER_ID,
    });

    expect(result.skipped).toEqual([]);
    expect(result.mappings).toHaveLength(1);
    expect(result.mappings[0]).toMatchObject({
      mondayBoardId: "b1",
      mondayBoardName: "[BR] Cliente Produto 01-999",
      activitiesGroupId: "group_mm2e2g9j",
      workspaceId: WORKSPACE_ID,
      columnIds: {
        reportedHours: "numeric_mm33gj5m",
        billingType: "color_mm33rxm7",
        activityType: "color_mm19csp3",
        status: "status",
        person: "person",
      },
    });
    expect(projectRepo.save).toHaveBeenCalledTimes(1);
  });

  it("reaproveita projetos já existentes em vez de duplicar", async () => {
    const api = makeApi([board()], { b1: schema() });
    const projectRepo = makeProjectRepo([
      { id: "p-existente", name: "[BR] Cliente Produto 01-999" },
    ]);

    const result = await importMondayProjects({ api, projectRepo, workspaceId: WORKSPACE_ID });

    expect(result.mappings[0].deskclockProjectId).toBe("p-existente");
    expect(projectRepo.save).not.toHaveBeenCalled();
  });

  it("não consulta o schema de templates e subitens", async () => {
    const api = makeApi(
      [
        board({ id: "b1" }),
        board({ id: "b2", name: "Template de Projeto - Pacote até 60h" }),
        board({ id: "b3", name: "Subitems of Projeto", folderId: null }),
      ],
      { b1: schema() }
    );

    const result = await importMondayProjects({
      api,
      projectRepo: makeProjectRepo(),
      workspaceId: WORKSPACE_ID,
      folderId: FOLDER_ID,
    });

    expect(result.mappings).toHaveLength(1);
    expect(api.getBoardSchema).toHaveBeenCalledTimes(1);
    expect(api.getBoardSchema).toHaveBeenCalledWith("b1");
  });

  it("pula boards fora do template e reporta o que faltou", async () => {
    const api = makeApi([board({ id: "b1" }), board({ id: "b2", name: "Board estranho" })], {
      b1: schema(),
      b2: schema({ id: "b2", name: "Board estranho", groups: [], views: [] }),
    });

    const result = await importMondayProjects({
      api,
      projectRepo: makeProjectRepo(),
      workspaceId: WORKSPACE_ID,
    });

    expect(result.mappings).toHaveLength(1);
    expect(result.skipped).toEqual([
      { boardName: "Board estranho", reason: "Não encontrado: grupo Activities." },
    ]);
  });

  it("segue importando quando a leitura de um board falha", async () => {
    const api = makeApi([board({ id: "b1" }), board({ id: "b-quebrado", name: "Board sumido" })], {
      b1: schema(),
    });

    const result = await importMondayProjects({
      api,
      projectRepo: makeProjectRepo(),
      workspaceId: WORKSPACE_ID,
    });

    expect(result.mappings).toHaveLength(1);
    expect(result.skipped[0].boardName).toBe("Board sumido");
  });

  it("reporta progresso do início ao fim", async () => {
    const api = makeApi([board({ id: "b1" }), board({ id: "b2", name: "Outro" })], {
      b1: schema(),
      b2: schema({ id: "b2", name: "Outro" }),
    });
    const onProgress = vi.fn();

    await importMondayProjects({
      api,
      projectRepo: makeProjectRepo(),
      workspaceId: WORKSPACE_ID,
      onProgress,
    });

    expect(onProgress).toHaveBeenCalledWith(0, 2);
    expect(onProgress).toHaveBeenLastCalledWith(2, 2);
  });
});
