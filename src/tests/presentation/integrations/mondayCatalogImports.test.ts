import { describe, it, expect, vi } from "vitest";
import type { IMondayApi } from "@domain/integrations/IMondayApi";
import { DEFAULT_WORKSPACE_ID } from "@domain/entities/Workspace";
import { MONDAY_MAPPING_CACHE_VERSION } from "@domain/usecases/monday/mondayMappingCachePolicy";
import {
  mondayCatalogsReadBlocker,
  mondayCategoriesImportBlocker,
  mondayProjectsImportBlocker,
  runMondayCatalogsRead,
  runMondayCategoriesImport,
  runMondayProjectsImport,
  runMondaySetProjectBoard,
} from "@presentation/integrations/mondayCatalogImports";
import type { ConfigContextValue } from "@shared/types/appConfig";
import { EMPTY_FIELD_CATALOGS } from "@shared/types/mondayConfig";

function makeConfig(values: Record<string, unknown>) {
  const store: Record<string, unknown> = { mondayProjectMapping: [], ...values };
  return {
    isLoaded: true,
    loadError: null,
    get: vi.fn((key: string) => store[key]),
    set: vi.fn(async (key: string, value: unknown) => {
      store[key] = value;
    }),
  } as unknown as ConfigContextValue & { set: ReturnType<typeof vi.fn> };
}

function repos() {
  return {
    projectRepo: {
      findAll: vi.fn(async () => []),
      findByName: vi.fn(async () => null),
      save: vi.fn(async () => {}),
    },
    categoryRepo: {
      findAll: vi.fn(async () => []),
      findByName: vi.fn(async (name: string) => (name === "Development" ? { id: "c" } : null)),
      save: vi.fn(async () => {}),
    },
    projectCategoryRepo: { findAll: vi.fn(async () => []), replaceMondayFor: vi.fn() },
    notifyProjectsChanged: vi.fn(async () => {}),
    notifyProjectCategoriesChanged: vi.fn(async () => {}),
    notifyCategoriesChanged: vi.fn(async () => {}),
  };
}

describe("bloqueios dos botões", () => {
  it("sem token, sem Portfólio, sem rótulo e sem Report", () => {
    expect(mondayProjectsImportBlocker(makeConfig({}))).toBe(
      "Monday não configurado. Verifique o token e o workspace."
    );
    expect(
      mondayProjectsImportBlocker(makeConfig({ mondayApiKey: "k", mondayPortfolioBoardId: "" }))
    ).toContain("Portfólio");
    expect(
      mondayProjectsImportBlocker(makeConfig({ mondayApiKey: "k", mondayPortfolioBoardId: "1" }))
    ).toBeNull();
    expect(
      mondayCategoriesImportBlocker(makeConfig({ mondayFieldCatalogs: EMPTY_FIELD_CATALOGS }))
    ).toBe("Leia os catálogos ou importe os projetos.");
    expect(
      mondayCatalogsReadBlocker(makeConfig({ mondayApiKey: "k", mondayReportBoardId: "" }))
    ).toBe("Informe o id do board de Report de Horas em Integrações.");
  });
});

describe("runMondayProjectsImport", () => {
  it("relê o Portfólio forçando o schema, grava o vínculo, marca o dia e avisa", async () => {
    const config = makeConfig({ mondayApiKey: "k", mondayPortfolioBoardId: "pf" });
    const api = {
      listItems: vi.fn(async (_boards: string[], _options?: unknown) => []),
      listBoardSchemas: vi.fn(async () => []),
    };
    const r = repos();

    const result = await runMondayProjectsImport({
      ...(r as unknown as Omit<Parameters<typeof runMondayProjectsImport>[0], "config" | "api">),
      config,
      api: api as unknown as IMondayApi,
    });

    expect(api.listItems.mock.calls[0][0]).toEqual(["pf"]);
    expect(r.projectRepo.findAll).toHaveBeenCalledWith(DEFAULT_WORKSPACE_ID);
    expect(result).toMatchObject({ mappings: [], skipped: [], ignored: 0 });
    const keys = config.set.mock.calls.map(([key]) => key);
    expect(keys).toEqual([
      "mondayProjectMapping",
      "mondayProjectsSyncLastDate",
      "mondayMappingCacheVersion",
      "mondayProjectsLastSyncError",
    ]);
    expect(config.set).toHaveBeenCalledWith(
      "mondayMappingCacheVersion",
      MONDAY_MAPPING_CACHE_VERSION
    );
    expect(r.notifyProjectsChanged).toHaveBeenCalled();
    expect(r.notifyProjectCategoriesChanged).toHaveBeenCalled();
  });
});

describe("runMondayCategoriesImport", () => {
  it("cria um por Activity Type do catálogo no workspace da integração e avisa", async () => {
    const config = makeConfig({
      mondayDeskclockWorkspaceId: "ws-m",
      mondayFieldCatalogs: { ...EMPTY_FIELD_CATALOGS, activityType: ["Development", "QA"] },
    });
    const r = repos();
    const result = await runMondayCategoriesImport({
      config,
      categoryRepo: r.categoryRepo as never,
      notifyCategoriesChanged: r.notifyCategoriesChanged,
    });
    expect(result).toEqual({ created: ["QA"], existing: ["Development"] });
    expect(r.categoryRepo.findByName).toHaveBeenCalledWith("QA", "ws-m");
    expect(r.notifyCategoriesChanged).toHaveBeenCalled();
  });
});

describe("runMondayCatalogsRead", () => {
  it("lê o board de Report e guarda na config", async () => {
    const config = makeConfig({ mondayReportBoardId: "rep" });
    const api = {
      getBoardSchema: vi.fn(async () => ({
        id: "rep",
        name: "",
        groups: [],
        columns: [],
        views: [],
      })),
    };
    const result = await runMondayCatalogsRead({ config, api: api as unknown as IMondayApi });
    expect(api.getBoardSchema).toHaveBeenCalledWith("rep");
    expect(result).toEqual(EMPTY_FIELD_CATALOGS);
    expect(config.set).toHaveBeenCalledWith("mondayFieldCatalogs", result);
  });
});

describe("quadro digitado à mão", () => {
  it("lê o schema e grava o destino no vínculo do item", async () => {
    const config = makeConfig({
      mondayProjectMapping: [
        { portfolioItemId: "i1", deskclockProjectId: "p1", mondayBoardId: "" },
        { portfolioItemId: "i2", deskclockProjectId: "p2", mondayBoardId: "" },
      ],
    });
    const api = {
      getBoardSchema: vi.fn(async () => {
        throw new Error("board inacessível");
      }),
    } as unknown as IMondayApi;
    await expect(
      runMondaySetProjectBoard({ config, api }, "i1", "99", "2026-09-15T10:00:00Z")
    ).rejects.toThrow("board inacessível");
    expect(config.set).not.toHaveBeenCalled();
  });
});
