import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  importMondayProjects,
  PORTFOLIO_BOARD_COLUMN_ID,
  PORTFOLIO_OFFER_COLUMN_ID,
} from "@domain/usecases/monday/importMondayProjects";
import type { IMondayApi } from "@domain/integrations/IMondayApi";
import type { IProjectRepository } from "@domain/repositories/IProjectRepository";
import type { Project } from "@domain/entities/Project";
import type { MondayBoardSchema, MondayItem } from "@shared/types/monday";
import type { MondayProjectMapping } from "@shared/types/mondayConfig";

const PORTFOLIO_ID = "18418432045";
const DESKCLOCK_WS = "ws-1";

/** Um item do Portfólio, com as duas colunas que a importação lê. */
function item({
  id = "i1",
  name = "[BR] Cliente Produto 01-999",
  offer = "Escopo Fechado" as string | null,
  projectBoardId = "b1" as string | null,
}: Partial<{
  id: string;
  name: string;
  offer: string | null;
  projectBoardId: string | null;
}> = {}): MondayItem {
  return {
    id,
    name,
    url: `https://monday.com/boards/${PORTFOLIO_ID}/pulses/${id}`,
    boardId: PORTFOLIO_ID,
    groupId: "topics",
    groupTitle: "Projetos",
    createdAt: "2026-08-01T00:00:00Z",
    columnValues: [
      { id: PORTFOLIO_OFFER_COLUMN_ID, type: "status", text: offer, value: null },
      { id: PORTFOLIO_BOARD_COLUMN_ID, type: "text", text: projectBoardId, value: null },
    ],
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

function makeApi(items: MondayItem[], schemas: Record<string, MondayBoardSchema>): IMondayApi {
  return {
    getMe: vi.fn(),
    listWorkspaces: vi.fn(),
    listFolders: vi.fn(),
    listBoards: vi.fn(async () => []),
    getBoardSchema: vi.fn(async (id: string) => {
      const found = schemas[id];
      if (!found) throw new Error(`Board ${id} não encontrado no Monday.`);
      return found;
    }),
    listBoardSchemas: vi.fn(async () => []),
    listItems: vi.fn(async () => items),
    createItem: vi.fn(),
    changeColumnValues: vi.fn(),
    moveItemToGroup: vi.fn(),
    deleteItem: vi.fn(),
  };
}

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

function run(api: IMondayApi, overrides: Record<string, unknown> = {}) {
  return importMondayProjects({
    api,
    projectRepo: makeProjectRepo(),
    portfolioBoardId: PORTFOLIO_ID,
    deskclockWorkspaceId: DESKCLOCK_WS,
    ...overrides,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("importMondayProjects", () => {
  it("cria um projeto por item do Portfólio, com o quadro de destino resolvido", async () => {
    const api = makeApi([item()], { b1: schema() });
    const projectRepo = makeProjectRepo();

    const result = await run(api, { projectRepo });

    expect(result.skipped).toEqual([]);
    expect(result.mappings).toHaveLength(1);
    expect(result.mappings[0]).toMatchObject({
      portfolioItemId: "i1",
      mondayBoardId: "b1",
      mondayBoardName: "[BR] Cliente Produto 01-999",
      scope: "cliente",
      activitiesGroupId: "group_mm2e2g9j",
      columnIds: {
        reportedHours: "numeric_mm33gj5m",
        billingType: "color_mm33rxm7",
        activityType: "color_mm19csp3",
        status: "status",
        person: "person",
      },
      activityTypeLabels: [],
      projectStageLabels: [],
      projectStageTitle: "",
    });
    expect(projectRepo.save).toHaveBeenCalledTimes(1);
  });

  it("lê do Monday só o Portfólio e só as duas colunas que usa", async () => {
    const api = makeApi([item()], { b1: schema() });

    await run(api);

    expect(api.listItems).toHaveBeenCalledWith([PORTFOLIO_ID], {
      columnIds: [PORTFOLIO_OFFER_COLUMN_ID, PORTFOLIO_BOARD_COLUMN_ID],
    });
  });

  it("classifica pela Oferta: 'Atividades Internas' é interno, o resto é cliente", async () => {
    const api = makeApi(
      [
        item({ id: "i1", name: "Cliente", offer: "Pacote até 30h", projectBoardId: "b1" }),
        item({
          id: "i2",
          name: "Tech Atividades Internas",
          offer: "Atividades Internas",
          projectBoardId: "b2",
        }),
      ],
      { b1: schema(), b2: schema({ id: "b2", name: "Tech Atividades Internas" }) }
    );

    const result = await run(api);

    expect(result.mappings.map((m) => m.scope)).toEqual(["cliente", "interno"]);
  });

  // "Vazia → o item é ignorado, não vira Project" — hoje são 2 dos 62 itens.
  // Não é falha do template: não entra em `skipped`, porque não há o que corrigir
  // no board de destino, e sim uma linha do Portfólio que ninguém classificou.
  it("ignora item sem Oferta", async () => {
    const api = makeApi(
      [
        item({ id: "i1", offer: "Squad", projectBoardId: "b1" }),
        item({ id: "i2", name: "Novo projeto Pedro", offer: null, projectBoardId: "b9" }),
        item({ id: "i3", name: "Eucatex", offer: "  ", projectBoardId: "b9" }),
      ],
      { b1: schema() }
    );

    const result = await run(api);

    expect(result.mappings.map((m) => m.portfolioItemId)).toEqual(["i1"]);
    expect(result.skipped).toEqual([]);
    expect(result.ignored).toBe(2);
    expect(api.getBoardSchema).toHaveBeenCalledTimes(1);
  });

  // 14 dos 62 itens estão assim. O projeto existe e recebe tarefas; só as horas
  // não sobem, e a tela de Integrações oferece o campo para preencher à mão.
  it("cria o projeto do item sem quadro de destino, sem grupo nem colunas", async () => {
    const api = makeApi([item({ projectBoardId: null })], { b1: schema() });
    const projectRepo = makeProjectRepo();

    const result = await run(api, { projectRepo });

    expect(result.mappings).toHaveLength(1);
    expect(result.mappings[0]).toMatchObject({
      mondayBoardId: "",
      activitiesGroupId: "",
    });
    expect(projectRepo.save).toHaveBeenCalledTimes(1);
    expect(api.getBoardSchema).not.toHaveBeenCalled();
  });

  it("preserva o quadro preenchido à mão quando o Portfólio devolve a coluna vazia", async () => {
    const api = makeApi([item({ projectBoardId: "" })], { "b-manual": schema({ id: "b-manual" }) });
    const existing = [{ portfolioItemId: "i1", mondayBoardId: "b-manual" } as MondayProjectMapping];

    const result = await run(api, { existingMappings: existing });

    expect(result.mappings[0].mondayBoardId).toBe("b-manual");
    expect(result.mappings[0].activitiesGroupId).toBe("group_mm2e2g9j");
  });

  it("sobrescreve o quadro local quando o Portfólio devolve outro", async () => {
    const api = makeApi([item({ projectBoardId: "b-novo" })], {
      "b-novo": schema({ id: "b-novo" }),
    });
    const existing = [{ portfolioItemId: "i1", mondayBoardId: "b-antigo" } as MondayProjectMapping];

    const result = await run(api, { existingMappings: existing });

    expect(result.mappings[0].mondayBoardId).toBe("b-novo");
  });

  it("mantém o projeto do board fora do template e reporta o que faltou", async () => {
    const api = makeApi([item({ id: "i1", projectBoardId: "b1" })], {
      b1: schema({ groups: [], views: [] }),
    });

    const result = await run(api);

    expect(result.mappings).toHaveLength(1);
    expect(result.mappings[0]).toMatchObject({ mondayBoardId: "b1", activitiesGroupId: "" });
    expect(result.skipped).toEqual([
      {
        boardName: "[BR] Cliente Produto 01-999",
        reason: "Não encontrado: grupo Activities.",
      },
    ]);
  });

  it("segue importando quando a leitura de um board falha", async () => {
    const api = makeApi(
      [
        item({ id: "i1", projectBoardId: "b1" }),
        item({ id: "i2", name: "Board sumido", projectBoardId: "b-quebrado" }),
      ],
      { b1: schema() }
    );

    const result = await run(api);

    expect(result.mappings).toHaveLength(2);
    expect(result.skipped[0].boardName).toBe("Board sumido");
  });

  it("cacheia os rótulos das colunas de status no mapeamento", async () => {
    const api = makeApi([item()], {
      b1: schema({
        columns: [
          { id: "numeric_mm33gj5m", title: "Reported Hours", type: "numbers" },
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
          { id: "person", title: "Owner", type: "people" },
        ],
      }),
    });

    const result = await run(api);

    expect(result.mappings[0]).toMatchObject({
      activityTypeLabels: ["Development", "Meeting"],
      projectStageLabels: ["Discovery", "Execução"],
      projectStageTitle: "Project Stage",
    });
  });

  it("reaproveita projetos já existentes em vez de duplicar", async () => {
    const api = makeApi([item()], { b1: schema() });
    const projectRepo = makeProjectRepo([
      { id: "p-existente", name: "[BR] Cliente Produto 01-999" },
    ]);

    const result = await run(api, { projectRepo });

    expect(result.mappings[0].deskclockProjectId).toBe("p-existente");
    expect(projectRepo.save).not.toHaveBeenCalled();
  });

  it("reporta progresso do início ao fim", async () => {
    const api = makeApi(
      [item({ id: "i1", projectBoardId: "b1" }), item({ id: "i2", projectBoardId: "b2" })],
      { b1: schema(), b2: schema({ id: "b2" }) }
    );
    const onProgress = vi.fn();

    await run(api, { onProgress });

    expect(onProgress).toHaveBeenCalledWith(0, 2);
    expect(onProgress).toHaveBeenLastCalledWith(2, 2);
  });

  // O total do progresso é o que será importado, não o tamanho do board: começar
  // em 63 para terminar em 61 fazia os dois itens sem Oferta sumirem calados.
  it("conta no progresso só os itens que virão a ser projeto", async () => {
    const api = makeApi(
      [
        item({ id: "i1", projectBoardId: "b1" }),
        item({ id: "i2", name: "Sem oferta", offer: null, projectBoardId: "b2" }),
        item({ id: "i3", name: "Outro", projectBoardId: "b2" }),
      ],
      { b1: schema(), b2: schema({ id: "b2" }) }
    );
    const onProgress = vi.fn();

    const result = await run(api, { onProgress });

    expect(onProgress).toHaveBeenCalledWith(0, 2);
    expect(onProgress).toHaveBeenLastCalledWith(2, 2);
    expect(result.mappings).toHaveLength(2);
    expect(result.ignored).toBe(1);
  });
});
