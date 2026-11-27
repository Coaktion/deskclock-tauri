import { describe, it, expect, vi } from "vitest";
import type { IClockifyApi } from "@domain/integrations/IClockifyApi";
import {
  clockifyProjectRefs,
  refreshClockifyWorkspaces,
  runClockifyProjectsImport,
  runClockifyTagsImport,
  saveClockifyProjectMapping,
  selectClockifyWorkspace,
} from "@presentation/integrations/clockifySettings";

function makeConfig(values: Record<string, unknown> = {}) {
  const store: Record<string, unknown> = {
    clockifyProjectMapping: [],
    clockifyCategoryMapping: [],
    ...values,
  };
  const config = {
    get: vi.fn((key: string) => store[key]),
    set: vi.fn(async (key: string, value: unknown) => {
      store[key] = value;
    }),
  };
  return { store, config: config as unknown as Parameters<typeof refreshClockifyWorkspaces>[0] };
}

function makeApi(): IClockifyApi {
  return {
    listWorkspaces: vi.fn(async () => [{ id: "cw", name: "Aktie" }]),
    listProjects: vi.fn(async () => [
      { id: "cp2", name: "Suporte", clientName: "Beta" },
      { id: "cp1", name: "Portal", clientName: "Acme" },
    ]),
    listTags: vi.fn(async () => [{ id: "t1", name: "Dev" }]),
  } as unknown as IClockifyApi;
}

describe("ajustes do Clockify", () => {
  it("atualizar a lista grava o cache; trocar grava id e nome", async () => {
    const { store, config } = makeConfig();
    expect(await refreshClockifyWorkspaces(config, makeApi())).toEqual([
      { id: "cw", name: "Aktie" },
    ]);
    expect(store.clockifyWorkspaceCache).toEqual([{ id: "cw", name: "Aktie" }]);
    await selectClockifyWorkspace(config, { id: "cw", name: "Aktie" });
    expect(store.clockifyActiveWorkspaceId).toBe("cw");
    expect(store.clockifyActiveWorkspaceName).toBe("Aktie");
  });

  it("projetos pelo nome exibido, em ordem", () => {
    expect(
      clockifyProjectRefs([
        { id: "b", name: "Suporte", clientName: "Beta" },
        { id: "a", name: "Portal", clientName: "Acme" },
      ]).map((p) => p.name)
    ).toEqual(["Acme - Portal", "Beta - Suporte"]);
  });

  it("vincular devolve só os do workspace do Clockify", async () => {
    const { config } = makeConfig({
      clockifyProjectMapping: [
        {
          deskclockProjectId: "x",
          clockifyProjectId: "o",
          clockifyProjectName: "",
          workspaceId: "w2",
        },
      ],
    });
    const result = await saveClockifyProjectMapping(config, "w1", "p", { id: "c", name: "C" });
    expect(result).toEqual([
      {
        deskclockProjectId: "p",
        clockifyProjectId: "c",
        clockifyProjectName: "C",
        workspaceId: "w1",
      },
    ]);
  });

  it("importar projetos cria o que falta, vincula, troca só os do workspace e avisa", async () => {
    const { store, config } = makeConfig({
      clockifyProjectMapping: [
        {
          deskclockProjectId: "old",
          clockifyProjectId: "o",
          clockifyProjectName: "",
          workspaceId: "cw",
        },
        {
          deskclockProjectId: "keep",
          clockifyProjectId: "k",
          clockifyProjectName: "",
          workspaceId: "w2",
        },
      ],
    });
    const existing = { id: "dp1", name: "Acme - Portal", workspaceId: "ws", colorIndex: 0 };
    const projectRepo = {
      findAll: vi.fn(async () => [existing]),
      findByName: vi.fn(async (name: string) => (name === existing.name ? existing : null)),
      save: vi.fn(async () => {}),
      update: vi.fn(),
      delete: vi.fn(),
      deleteMany: vi.fn(),
    };
    const notify = vi.fn(async () => {});
    const onFetched = vi.fn();
    const result = await runClockifyProjectsImport({
      config,
      api: makeApi(),
      clockifyWorkspaceId: "cw",
      deskclockWorkspaceId: "ws",
      projectRepo,
      notifyProjectsChanged: notify,
      onFetched,
    });
    expect(result.fetched).toBe(2);
    expect(result.mappings.map((m) => m.clockifyProjectName)).toEqual([
      "Beta - Suporte",
      "Acme - Portal",
    ]);
    expect(projectRepo.save).toHaveBeenCalledTimes(1);
    const saved = store.clockifyProjectMapping as { deskclockProjectId: string }[];
    expect(saved.map((m) => m.deskclockProjectId)).toContain("keep");
    expect(saved.map((m) => m.deskclockProjectId)).not.toContain("old");
    expect(notify).toHaveBeenCalled();
    expect(onFetched).toHaveBeenCalledWith([
      { id: "cp1", name: "Acme - Portal" },
      { id: "cp2", name: "Beta - Suporte" },
    ]);
  });

  it("importar tags mantém as tags já vinculadas à categoria", async () => {
    const { config } = makeConfig({
      clockifyCategoryMapping: [
        { deskclockCategoryId: "c1", clockifyTagIds: ["t0"], workspaceId: "cw" },
      ],
    });
    const cat = { id: "c1", name: "Dev", workspaceId: "ws", defaultBillable: true };
    const categoryRepo = {
      findAll: vi.fn(async () => [cat]),
      findByName: vi.fn(async () => cat),
      save: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      deleteMany: vi.fn(),
    };
    const result = await runClockifyTagsImport({
      config,
      api: makeApi(),
      clockifyWorkspaceId: "cw",
      deskclockWorkspaceId: "ws",
      categoryRepo,
      notifyCategoriesChanged: vi.fn(async () => {}),
    });
    expect(result.mappings).toEqual([
      { deskclockCategoryId: "c1", clockifyTagIds: ["t0"], workspaceId: "cw" },
    ]);
  });
});
