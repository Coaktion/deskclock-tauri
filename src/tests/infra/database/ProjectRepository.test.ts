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
        { id: "1", workspace_id: "ws-1", name: "Alpha" },
        { id: "2", workspace_id: "ws-1", name: "Beta" },
      ]);
      const repo = new ProjectRepository();
      const result = await repo.findAll();
      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({ id: "1", workspaceId: "ws-1", name: "Alpha" });
      expect(result[1]).toEqual({ id: "2", workspaceId: "ws-1", name: "Beta" });
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
      mockDb.select.mockResolvedValue([{ id: "1", workspace_id: "ws-1", name: "Alpha" }]);
      const repo = new ProjectRepository();
      const result = await repo.findByName("Alpha", "ws-1");
      expect(result).toEqual({ id: "1", workspaceId: "ws-1", name: "Alpha" });
    });

    it("retorna null quando não encontrado", async () => {
      mockDb.select.mockResolvedValue([]);
      const repo = new ProjectRepository();
      const result = await repo.findByName("Inexistente", "ws-1");
      expect(result).toBeNull();
    });
  });

  describe("save", () => {
    it("executa INSERT com os dados corretos", async () => {
      const repo = new ProjectRepository();
      const project: Project = { id: "uuid-1", workspaceId: "ws-1", name: "Novo", colorIndex: 3 };
      await repo.save(project);
      expect(mockDb.execute).toHaveBeenCalledWith(expect.stringContaining("INSERT"), [
        "uuid-1",
        "ws-1",
        "Novo",
        3,
      ]);
    });
  });

  describe("delete", () => {
    it("executa DELETE com o id correto", async () => {
      const repo = new ProjectRepository();
      await repo.delete("uuid-1");
      expect(mockDb.execute).toHaveBeenCalledWith(expect.stringContaining("DELETE"), ["uuid-1"]);
    });
  });

  describe("deleteMany", () => {
    it("executa DELETE com múltiplos ids", async () => {
      const repo = new ProjectRepository();
      await repo.deleteMany(["uuid-1", "uuid-2", "uuid-3"]);
      expect(mockDb.execute).toHaveBeenCalledWith("DELETE FROM projects WHERE id IN ($1, $2, $3)", [
        "uuid-1",
        "uuid-2",
        "uuid-3",
      ]);
    });

    it("não executa nada quando lista vazia", async () => {
      const repo = new ProjectRepository();
      await repo.deleteMany([]);
      expect(mockDb.execute).not.toHaveBeenCalled();
    });
  });
});
