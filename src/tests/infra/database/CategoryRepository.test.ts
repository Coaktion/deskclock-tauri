import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Category } from "@domain/entities/Category";

// Mock getDb antes de importar o repositório
const mockDb = {
  select: vi.fn(),
  execute: vi.fn(),
};

vi.mock("@infra/database/db", () => ({
  getDb: vi.fn(async () => mockDb),
}));

// Import depois do mock
const { CategoryRepository } = await import("@infra/database/CategoryRepository");

describe("CategoryRepository", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDb.select.mockResolvedValue([]);
    mockDb.execute.mockResolvedValue({ rowsAffected: 1, lastInsertId: 0 });
  });

  describe("findAll", () => {
    it("converte default_billable=1 para defaultBillable=true", async () => {
      mockDb.select.mockResolvedValue([
        { id: "1", name: "Dev", default_billable: 1 },
      ]);
      const repo = new CategoryRepository();
      const result = await repo.findAll();
      expect(result[0].defaultBillable).toBe(true);
    });

    it("converte default_billable=0 para defaultBillable=false", async () => {
      mockDb.select.mockResolvedValue([
        { id: "2", name: "Reuniões", default_billable: 0 },
      ]);
      const repo = new CategoryRepository();
      const result = await repo.findAll();
      expect(result[0].defaultBillable).toBe(false);
    });

    it("mapeia todos os campos corretamente", async () => {
      mockDb.select.mockResolvedValue([
        { id: "1", name: "Dev", default_billable: 1 },
        { id: "2", name: "Reuniões", default_billable: 0 },
      ]);
      const repo = new CategoryRepository();
      const result = await repo.findAll();
      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({ id: "1", name: "Dev", defaultBillable: true });
      expect(result[1]).toEqual({ id: "2", name: "Reuniões", defaultBillable: false });
    });
  });

  describe("findByName", () => {
    it("retorna a categoria quando encontrada", async () => {
      mockDb.select.mockResolvedValue([{ id: "1", name: "Dev", default_billable: 1 }]);
      const repo = new CategoryRepository();
      const result = await repo.findByName("Dev");
      expect(result).toEqual({ id: "1", name: "Dev", defaultBillable: true });
    });

    it("retorna null quando não encontrada", async () => {
      mockDb.select.mockResolvedValue([]);
      const repo = new CategoryRepository();
      const result = await repo.findByName("Inexistente");
      expect(result).toBeNull();
    });
  });

  describe("save", () => {
    it("converte defaultBillable=true para 1 no SQL", async () => {
      const repo = new CategoryRepository();
      const category: Category = { id: "uuid-1", name: "Dev", defaultBillable: true };
      await repo.save(category);
      expect(mockDb.execute).toHaveBeenCalledWith(
        expect.stringContaining("INSERT"),
        ["uuid-1", "Dev", 1]
      );
    });

    it("converte defaultBillable=false para 0 no SQL", async () => {
      const repo = new CategoryRepository();
      const category: Category = { id: "uuid-2", name: "Reuniões", defaultBillable: false };
      await repo.save(category);
      expect(mockDb.execute).toHaveBeenCalledWith(
        expect.stringContaining("INSERT"),
        ["uuid-2", "Reuniões", 0]
      );
    });
  });

  describe("delete", () => {
    it("executa DELETE com o id correto", async () => {
      const repo = new CategoryRepository();
      await repo.delete("uuid-1");
      expect(mockDb.execute).toHaveBeenCalledWith(
        expect.stringContaining("DELETE"),
        ["uuid-1"]
      );
    });
  });
});
