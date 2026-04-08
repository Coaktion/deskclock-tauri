import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Project } from "@domain/entities/Project";

// Mock getDb antes de importar o repositório
const mockDb = {
  select: vi.fn(),
  execute: vi.fn(),
};

vi.mock("@infra/database/db", () => ({
  getDb: vi.fn(async () => mockDb),
}));

// Import depois do mock
const { ProjectRepository } = await import("@infra/database/ProjectRepository");

describe("ProjectRepository", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDb.select.mockResolvedValue([]);
    mockDb.execute.mockResolvedValue({ rowsAffected: 1, lastInsertId: 0 });
  });

  describe("findAll", () => {
    it("retorna lista de projetos mapeados das rows", async () => {
      mockDb.select.mockResolvedValue([
        { id: "1", name: "Alpha" },
        { id: "2", name: "Beta" },
      ]);
      const repo = new ProjectRepository();
      const result = await repo.findAll();
      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({ id: "1", name: "Alpha" });
      expect(result[1]).toEqual({ id: "2", name: "Beta" });
    });

    it("retorna array vazio quando não há projetos", async () => {
      mockDb.select.mockResolvedValue([]);
      const repo = new ProjectRepository();
      const result = await repo.findAll();
      expect(result).toHaveLength(0);
    });
  });

  describe("findByName", () => {
    it("retorna o projeto quando encontrado", async () => {
      mockDb.select.mockResolvedValue([{ id: "1", name: "Alpha" }]);
      const repo = new ProjectRepository();
      const result = await repo.findByName("Alpha");
      expect(result).toEqual({ id: "1", name: "Alpha" });
    });

    it("retorna null quando não encontrado", async () => {
      mockDb.select.mockResolvedValue([]);
      const repo = new ProjectRepository();
      const result = await repo.findByName("Inexistente");
      expect(result).toBeNull();
    });
  });

  describe("save", () => {
    it("executa INSERT com os dados corretos", async () => {
      const repo = new ProjectRepository();
      const project: Project = { id: "uuid-1", name: "Novo" };
      await repo.save(project);
      expect(mockDb.execute).toHaveBeenCalledWith(
        expect.stringContaining("INSERT"),
        ["uuid-1", "Novo"]
      );
    });
  });

  describe("delete", () => {
    it("executa DELETE com o id correto", async () => {
      const repo = new ProjectRepository();
      await repo.delete("uuid-1");
      expect(mockDb.execute).toHaveBeenCalledWith(
        expect.stringContaining("DELETE"),
        ["uuid-1"]
      );
    });
  });
});
