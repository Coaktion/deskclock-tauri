import { describe, it, expect, vi } from "vitest";
import type { Category } from "@domain/entities/Category";
import type { ProjectCategory, ProjectCategorySource } from "@domain/entities/ProjectCategory";
import type { ICategoryRepository } from "@domain/repositories/ICategoryRepository";
import type { IProjectCategoryRepository } from "@domain/repositories/IProjectCategoryRepository";
import type { MondayProjectMapping } from "@shared/types/mondayConfig";
import { seedMondayProjectCategories } from "@domain/usecases/monday/seedMondayProjectCategories";

function makeCategory(id: string, name: string): Category {
  return { id, workspaceId: "ws1", name, defaultBillable: true };
}

function makeMapping(
  deskclockProjectId: string,
  activityTypeLabels: string[]
): MondayProjectMapping {
  return {
    deskclockProjectId,
    portfolioItemId: "i1",
    mondayBoardId: "b1",
    mondayBoardName: "Cliente A",
    scope: "cliente",
    activitiesGroupId: "g1",
    reportTypeGroupIds: {},
    columnIds: { reportedHours: "h", activityType: "a", person: "p" },
    activityTypeLabels,
    projectStageLabels: [],
    projectStageTitle: "",
    nonBillableReasonLabels: [],
  };
}

function makeRepos(categories: Category[], existing: ProjectCategory[] = []) {
  const categoryRepo = { findAll: vi.fn().mockResolvedValue(categories) };
  const projectCategoryRepo = {
    findAll: vi.fn().mockResolvedValue(existing),
    replaceMondayFor: vi.fn().mockResolvedValue(undefined),
  };
  return {
    categoryRepo,
    projectCategoryRepo,
    // Os dois repositórios têm mais métodos; o use case só toca nestes.
    input: {
      categoryRepo: categoryRepo as unknown as ICategoryRepository,
      projectCategoryRepo: projectCategoryRepo as unknown as IProjectCategoryRepository,
    },
  };
}

function assoc(
  projectId: string,
  categoryId: string,
  source: ProjectCategorySource = "monday"
): ProjectCategory {
  return { projectId, categoryId, source, createdAt: "2026-08-06T12:00:00.000Z" };
}

describe("seedMondayProjectCategories", () => {
  it("associa o projeto às categorias cujo nome bate com o Activity Type", async () => {
    const repos = makeRepos([makeCategory("c1", "Desenvolvimento"), makeCategory("c2", "Reunião")]);

    const result = await seedMondayProjectCategories({
      mappings: [makeMapping("p1", ["Desenvolvimento", "Reunião"])],
      workspaceId: "ws1",
      ...repos.input,
    });

    expect(repos.projectCategoryRepo.replaceMondayFor).toHaveBeenCalledWith("p1", ["c1", "c2"]);
    expect(result).toEqual({ seeded: 2, projects: 1 });
  });

  it("casa ignorando caixa e espaços das pontas", async () => {
    const repos = makeRepos([makeCategory("c1", "Desenvolvimento")]);

    await seedMondayProjectCategories({
      mappings: [makeMapping("p1", ["  desenvolvimento "])],
      workspaceId: "ws1",
      ...repos.input,
    });

    expect(repos.projectCategoryRepo.replaceMondayFor).toHaveBeenCalledWith("p1", ["c1"]);
  });

  it("rótulo sem categoria correspondente é ignorado em silêncio", async () => {
    const repos = makeRepos([makeCategory("c1", "Desenvolvimento")]);

    const result = await seedMondayProjectCategories({
      mappings: [makeMapping("p1", ["Desenvolvimento", "Rótulo que ninguém criou"])],
      workspaceId: "ws1",
      ...repos.input,
    });

    expect(repos.projectCategoryRepo.replaceMondayFor).toHaveBeenCalledWith("p1", ["c1"]);
    expect(result.seeded).toBe(1);
  });

  it("board sem rótulo nenhum é pulado, não zerado — leitura falha não apaga associação", async () => {
    const repos = makeRepos([makeCategory("c1", "Desenvolvimento")]);

    const result = await seedMondayProjectCategories({
      mappings: [makeMapping("p1", [])],
      workspaceId: "ws1",
      ...repos.input,
    });

    expect(repos.projectCategoryRepo.replaceMondayFor).not.toHaveBeenCalled();
    expect(result).toEqual({ seeded: 0, projects: 0 });
  });

  it("nenhum rótulo casando também não escreve — seria apagar tudo por engano", async () => {
    const repos = makeRepos([makeCategory("c1", "Desenvolvimento")]);

    await seedMondayProjectCategories({
      mappings: [makeMapping("p1", ["Outra coisa"])],
      workspaceId: "ws1",
      ...repos.input,
    });

    expect(repos.projectCategoryRepo.replaceMondayFor).not.toHaveBeenCalled();
  });

  it("lê as categorias do workspace da integração, não de todos", async () => {
    const repos = makeRepos([]);

    await seedMondayProjectCategories({ mappings: [], workspaceId: "ws-monday", ...repos.input });

    expect(repos.categoryRepo.findAll).toHaveBeenCalledWith("ws-monday");
  });

  it("projeto cujo conjunto não mudou é pulado — é o que a deixa barata a cada abertura", async () => {
    const repos = makeRepos(
      [makeCategory("c1", "Desenvolvimento"), makeCategory("c2", "Reunião")],
      [assoc("p1", "c1"), assoc("p1", "c2")]
    );

    const result = await seedMondayProjectCategories({
      mappings: [makeMapping("p1", ["Desenvolvimento", "Reunião"])],
      workspaceId: "ws1",
      ...repos.input,
    });

    expect(repos.projectCategoryRepo.replaceMondayFor).not.toHaveBeenCalled();
    expect(result).toEqual({ seeded: 0, projects: 0 });
  });

  it("rótulo novo no quadro reescreve o conjunto", async () => {
    const repos = makeRepos(
      [makeCategory("c1", "Desenvolvimento"), makeCategory("c2", "Reunião")],
      [assoc("p1", "c1")]
    );

    await seedMondayProjectCategories({
      mappings: [makeMapping("p1", ["Desenvolvimento", "Reunião"])],
      workspaceId: "ws1",
      ...repos.input,
    });

    expect(repos.projectCategoryRepo.replaceMondayFor).toHaveBeenCalledWith("p1", ["c1", "c2"]);
  });

  it("associação manual do mesmo par não conta como já semeada", async () => {
    // O usuário marcou c1 à mão; a varredura ainda precisa gravá-la como
    // `monday`, ou o quadro nunca passaria a ser dono daquele vínculo.
    const repos = makeRepos([makeCategory("c1", "Desenvolvimento")], [assoc("p1", "c1", "manual")]);

    await seedMondayProjectCategories({
      mappings: [makeMapping("p1", ["Desenvolvimento"])],
      workspaceId: "ws1",
      ...repos.input,
    });

    expect(repos.projectCategoryRepo.replaceMondayFor).toHaveBeenCalledWith("p1", ["c1"]);
  });

  it("rótulo repetido no board não duplica a associação", async () => {
    const repos = makeRepos([makeCategory("c1", "Desenvolvimento")]);

    const result = await seedMondayProjectCategories({
      mappings: [makeMapping("p1", ["Desenvolvimento", "desenvolvimento"])],
      workspaceId: "ws1",
      ...repos.input,
    });

    expect(repos.projectCategoryRepo.replaceMondayFor).toHaveBeenCalledWith("p1", ["c1"]);
    expect(result.seeded).toBe(1);
  });
});
