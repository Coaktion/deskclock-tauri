import { describe, it, expect, vi, beforeEach } from "vitest";
import { importMondayCategories } from "@domain/usecases/monday/importMondayCategories";
import type { Category } from "@domain/entities/Category";
import type { ICategoryRepository } from "@domain/repositories/ICategoryRepository";
import type { MondayProjectMapping } from "@shared/types/mondayConfig";

const DESKCLOCK_WS = "ws-1";
const MONDAY_WS = "15505674";
const INTERNAL_BOARD = "int-1";

function mapping(overrides: Partial<MondayProjectMapping> = {}): MondayProjectMapping {
  return {
    deskclockProjectId: "p1",
    mondayBoardId: "b1",
    mondayBoardName: "[BR] Cliente Produto 01-999",
    activitiesGroupId: "g1",
    columnIds: {
      reportedHours: "num",
      billingType: "billing",
      activityType: "activity",
      status: "status",
      person: "person",
    },
    activityTypeLabels: ["Development", "Meeting"],
    projectStageLabels: [],
    projectStageTitle: "",
    workspaceId: MONDAY_WS,
    ...overrides,
  };
}

function makeRepo(existing: Category[] = []): ICategoryRepository {
  const rows = [...existing];
  return {
    findAll: vi.fn(async () => rows),
    findByName: vi.fn(
      async (name: string, workspaceId: string) =>
        rows.find((c) => c.name === name && c.workspaceId === workspaceId) ?? null
    ),
    save: vi.fn(async (category: Category) => {
      rows.push(category);
    }),
    update: vi.fn(),
    delete: vi.fn(),
    deleteMany: vi.fn(),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("importMondayCategories", () => {
  it("cria uma categoria billable por Activity Type de board de cliente", async () => {
    const categoryRepo = makeRepo();

    const result = await importMondayCategories({
      categoryRepo,
      mappings: [mapping()],
      deskclockWorkspaceId: DESKCLOCK_WS,
    });

    expect(result.created).toEqual(["Development", "Meeting"]);
    expect(vi.mocked(categoryRepo.save).mock.calls.map(([c]) => c)).toMatchObject([
      { name: "Development", defaultBillable: true, workspaceId: DESKCLOCK_WS },
      { name: "Meeting", defaultBillable: true, workspaceId: DESKCLOCK_WS },
    ]);
  });

  it("marca como non-billable os Activity Types do board interno", async () => {
    const categoryRepo = makeRepo();

    await importMondayCategories({
      categoryRepo,
      mappings: [
        mapping({ mondayBoardId: INTERNAL_BOARD, activityTypeLabels: ["Recrutamento", "Estudo"] }),
      ],
      internalBoardId: INTERNAL_BOARD,
      deskclockWorkspaceId: DESKCLOCK_WS,
    });

    expect(vi.mocked(categoryRepo.save).mock.calls.map(([c]) => c)).toMatchObject([
      { name: "Recrutamento", defaultBillable: false },
      { name: "Estudo", defaultBillable: false },
    ]);
  });

  it("rótulo presente nos dois lados fica billable", async () => {
    const categoryRepo = makeRepo();

    await importMondayCategories({
      categoryRepo,
      mappings: [
        mapping({ mondayBoardId: INTERNAL_BOARD, activityTypeLabels: ["Meeting", "Estudo"] }),
        mapping({ activityTypeLabels: ["Meeting"] }),
      ],
      internalBoardId: INTERNAL_BOARD,
      deskclockWorkspaceId: DESKCLOCK_WS,
    });

    expect(vi.mocked(categoryRepo.save).mock.calls.map(([c]) => c)).toMatchObject([
      { name: "Meeting", defaultBillable: true },
      { name: "Estudo", defaultBillable: false },
    ]);
  });

  it("não duplica nem sobrescreve categoria já existente no destino", async () => {
    const categoryRepo = makeRepo([
      { id: "c1", workspaceId: DESKCLOCK_WS, name: "Development", defaultBillable: false },
    ]);

    const result = await importMondayCategories({
      categoryRepo,
      mappings: [mapping()],
      deskclockWorkspaceId: DESKCLOCK_WS,
    });

    expect(result.existing).toEqual(["Development"]);
    expect(result.created).toEqual(["Meeting"]);
    expect(categoryRepo.update).not.toHaveBeenCalled();
  });

  it("cria no destino mesmo que o nome exista em outro workspace", async () => {
    const categoryRepo = makeRepo([
      { id: "c1", workspaceId: "outro-ws", name: "Development", defaultBillable: true },
    ]);

    const result = await importMondayCategories({
      categoryRepo,
      mappings: [mapping()],
      deskclockWorkspaceId: DESKCLOCK_WS,
    });

    expect(result.created).toContain("Development");
  });

  it("apara o rótulo antes de virar nome de categoria", async () => {
    const categoryRepo = makeRepo();

    const result = await importMondayCategories({
      categoryRepo,
      mappings: [mapping({ activityTypeLabels: ["  Development  ", "   "] })],
      deskclockWorkspaceId: DESKCLOCK_WS,
    });

    // O envio casa categoria e rótulo pelo nome; sobrar espaço numa das pontas
    // faria a coluna Activity Type sumir em silêncio.
    expect(result.created).toEqual(["Development"]);
  });

  it("não duplica rótulo repetido entre boards de cliente", async () => {
    const categoryRepo = makeRepo();

    const result = await importMondayCategories({
      categoryRepo,
      mappings: [
        mapping({ mondayBoardId: "b1", activityTypeLabels: ["Development"] }),
        mapping({ mondayBoardId: "b2", activityTypeLabels: ["Development", "Meeting"] }),
      ],
      deskclockWorkspaceId: DESKCLOCK_WS,
    });

    expect(result.created).toEqual(["Development", "Meeting"]);
  });

  it("não cria nada sem rótulo cacheado", async () => {
    const categoryRepo = makeRepo();

    const result = await importMondayCategories({
      categoryRepo,
      mappings: [mapping({ activityTypeLabels: [] })],
      deskclockWorkspaceId: DESKCLOCK_WS,
    });

    expect(result.created).toEqual([]);
    expect(categoryRepo.save).not.toHaveBeenCalled();
  });
});
