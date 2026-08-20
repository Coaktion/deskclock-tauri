import { describe, it, expect, vi, beforeEach } from "vitest";

const mockDb = {
  select: vi.fn(),
  execute: vi.fn(),
};

vi.mock("@infra/database/db", () => ({
  getDb: vi.fn(async () => mockDb),
}));

const { ProjectCategoryRepository } = await import("@infra/database/ProjectCategoryRepository");

function makeRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    project_id: "p1",
    category_id: "c1",
    source: "manual",
    created_at: "2026-08-06T12:00:00.000Z",
    ...overrides,
  };
}

/** O SQL de uma chamada de `execute`, com espaços colapsados para a asserção não depender da indentação. */
function sqlOf(callIndex: number): string {
  return String(mockDb.execute.mock.calls[callIndex][0]).replace(/\s+/g, " ").trim();
}

describe("ProjectCategoryRepository", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDb.select.mockResolvedValue([]);
    mockDb.execute.mockResolvedValue({ rowsAffected: 1, lastInsertId: 0 });
  });

  it("mapeia a linha para a entidade", async () => {
    mockDb.select.mockResolvedValue([makeRow({ source: "monday" })]);
    const [assoc] = await new ProjectCategoryRepository().findByProject("p1");
    expect(assoc).toEqual({
      projectId: "p1",
      categoryId: "c1",
      source: "monday",
      createdAt: "2026-08-06T12:00:00.000Z",
    });
  });

  it("findAll com workspace faz o join em projects — o workspace não mora aqui", async () => {
    await new ProjectCategoryRepository().findAll("ws1");
    const sql = String(mockDb.select.mock.calls[0][0]).replace(/\s+/g, " ");
    expect(sql).toContain("JOIN projects");
    expect(sql).toContain("p.workspace_id = $1");
    expect(mockDb.select.mock.calls[0][1]).toEqual(["ws1"]);
  });

  it("findAll sem workspace não filtra nada", async () => {
    await new ProjectCategoryRepository().findAll();
    expect(String(mockDb.select.mock.calls[0][0])).not.toContain("workspace_id");
  });

  it("setForProject apaga o que saiu da seleção, de qualquer origem", async () => {
    await new ProjectCategoryRepository().setForProject("p1", ["c1", "c2"]);

    // Sem recorte por `source`: apagar linha do Monday daqui é a saída de
    // emergência do filtro duro.
    expect(sqlOf(0)).toBe(
      "DELETE FROM project_categories WHERE project_id = $1 AND category_id NOT IN ($2, $3)"
    );
    expect(mockDb.execute.mock.calls[0][1]).toEqual(["p1", "c1", "c2"]);
  });

  it("setForProject não rebaixa a `monday` que continua selecionada", async () => {
    await new ProjectCategoryRepository().setForProject("p1", ["c1"]);

    // A linha que sobreviveu ao DELETE não é reescrita: o `OR IGNORE` a preserva
    // com a origem que ela já tinha, e a varredura segue dona dela.
    expect(sqlOf(1)).toContain("INSERT OR IGNORE");
    expect(mockDb.execute.mock.calls[1][1]).toEqual(["p1", "manual", expect.any(String), "c1"]);
  });

  it("replaceMondayFor apaga só as do Monday e não reivindica as manuais", async () => {
    await new ProjectCategoryRepository().replaceMondayFor("p1", ["c1"]);

    expect(sqlOf(0)).toBe(
      "DELETE FROM project_categories WHERE project_id = $1 AND source = 'monday'"
    );
    expect(sqlOf(1)).toContain("INSERT OR IGNORE");
    expect(mockDb.execute.mock.calls[1][1]).toEqual(["p1", "monday", expect.any(String), "c1"]);
  });

  it("lista vazia apaga tudo do projeto e não insere — volta a oferecer o catálogo inteiro", async () => {
    await new ProjectCategoryRepository().setForProject("p1", []);
    expect(mockDb.execute).toHaveBeenCalledOnce();
    expect(sqlOf(0)).toBe("DELETE FROM project_categories WHERE project_id = $1");
  });
});
