import { describe, it, expect, vi, beforeEach } from "vitest";
import { importMondayProjects } from "@domain/usecases/monday/importMondayProjects";
import type { IMondayApi } from "@domain/integrations/IMondayApi";
import type { IProjectRepository } from "@domain/repositories/IProjectRepository";
import type { Project } from "@domain/entities/Project";
import type { MondayBoardRef, MondayBoardSchema } from "@shared/types/monday";

const WORKSPACE_ID = "15505674";
const FOLDER_ID = "20715906";
const INTERNAL_FOLDER_ID = "30715907";

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

const DESKCLOCK_WS = "ws-1";

function makeProjectRepo(existing: { id: string; name: string }[] = []): IProjectRepository {
  const store: Project[] = existing.map((p) => ({ ...p, workspaceId: DESKCLOCK_WS }));
  return {
    findAll: vi.fn(async () => store),
    findByName: vi.fn(
      async (name: string, workspaceId: string) =>
        store.find((p) => p.name === name && p.workspaceId === workspaceId) ?? null
    ),
    save: vi.fn(async (project) => {
      store.push(project);
    }),
    update: vi.fn(),
    delete: vi.fn(),
    deleteMany: vi.fn(),
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
      deskclockWorkspaceId: DESKCLOCK_WS,
      clientsFolderId: FOLDER_ID,
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
      // Board sem coluna Project Stage e sem `settingsStr`: os campos de cache
      // precisam nascer vazios, não `undefined` — é o que `normalizeProjectMappings`
      // conserta rio abaixo para os vínculos gravados antes deles existirem.
      activityTypeLabels: [],
      projectStageLabels: [],
      projectStageTitle: "",
    });
    expect(projectRepo.save).toHaveBeenCalledTimes(1);
  });

  it("reaproveita projetos já existentes em vez de duplicar", async () => {
    const api = makeApi([board()], { b1: schema() });
    const projectRepo = makeProjectRepo([
      { id: "p-existente", name: "[BR] Cliente Produto 01-999" },
    ]);

    const result = await importMondayProjects({
      api,
      projectRepo,
      workspaceId: WORKSPACE_ID,
      deskclockWorkspaceId: DESKCLOCK_WS,
    });

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
      deskclockWorkspaceId: DESKCLOCK_WS,
      clientsFolderId: FOLDER_ID,
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
      deskclockWorkspaceId: DESKCLOCK_WS,
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
      deskclockWorkspaceId: DESKCLOCK_WS,
    });

    expect(result.mappings).toHaveLength(1);
    expect(result.skipped[0].boardName).toBe("Board sumido");
  });

  it("cacheia os rótulos das colunas de status no mapeamento", async () => {
    const api = makeApi([board()], {
      b1: schema({
        columns: [
          { id: "numeric_mm33gj5m", title: "Reported Hours", type: "numbers" },
          { id: "color_mm33rxm7", title: "Billing type", type: "status" },
          {
            id: "color_mm19csp3",
            title: "Activity Type",
            type: "status",
            settingsStr: JSON.stringify({ labels: { "0": "Development", "1": "Meeting" } }),
          },
          {
            id: "color_mm19zrwg",
            title: "Project Stage",
            type: "status",
            settingsStr: JSON.stringify({ labels: { "0": "Discovery", "1": "Execução" } }),
          },
          { id: "status", title: "Status", type: "status" },
          { id: "person", title: "Owner", type: "people" },
        ],
      }),
    });

    const result = await importMondayProjects({
      api,
      projectRepo: makeProjectRepo(),
      workspaceId: WORKSPACE_ID,
      deskclockWorkspaceId: DESKCLOCK_WS,
    });

    expect(result.mappings[0]).toMatchObject({
      activityTypeLabels: ["Development", "Meeting"],
      projectStageLabels: ["Discovery", "Execução"],
      projectStageTitle: "Project Stage",
    });
  });

  it("importa da pasta interna apenas o board vinculado", async () => {
    const api = makeApi(
      [
        board({ id: "b1" }),
        board({ id: "int-1", name: "Tech Atividades Internas", folderId: INTERNAL_FOLDER_ID }),
        board({ id: "int-2", name: "Design Atividades Internas", folderId: INTERNAL_FOLDER_ID }),
      ],
      { b1: schema(), "int-1": schema({ id: "int-1", name: "Tech Atividades Internas" }) }
    );

    const result = await importMondayProjects({
      api,
      projectRepo: makeProjectRepo(),
      workspaceId: WORKSPACE_ID,
      deskclockWorkspaceId: DESKCLOCK_WS,
      clientsFolderId: FOLDER_ID,
      internalFolderId: INTERNAL_FOLDER_ID,
      internalBoardId: "int-1",
    });

    expect(result.mappings.map((m) => m.mondayBoardId)).toEqual(["b1", "int-1"]);
    expect(api.getBoardSchema).not.toHaveBeenCalledWith("int-2");
  });

  it("ignora a pasta interna inteira quando nenhum board está vinculado", async () => {
    const api = makeApi(
      [
        board({ id: "b1" }),
        board({ id: "int-1", name: "Tech Atividades Internas", folderId: INTERNAL_FOLDER_ID }),
      ],
      { b1: schema(), "int-1": schema({ id: "int-1", name: "Tech Atividades Internas" }) }
    );

    const result = await importMondayProjects({
      api,
      projectRepo: makeProjectRepo(),
      workspaceId: WORKSPACE_ID,
      deskclockWorkspaceId: DESKCLOCK_WS,
      internalFolderId: INTERNAL_FOLDER_ID,
    });

    expect(result.mappings.map((m) => m.mondayBoardId)).toEqual(["b1"]);
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
      deskclockWorkspaceId: DESKCLOCK_WS,
      onProgress,
    });

    expect(onProgress).toHaveBeenCalledWith(0, 2);
    expect(onProgress).toHaveBeenLastCalledWith(2, 2);
  });
});
