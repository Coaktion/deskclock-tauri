import { describe, it, expect, vi, beforeEach } from "vitest";

const mockDb = {
  select: vi.fn(),
  execute: vi.fn(),
};

vi.mock("@infra/database/db", () => ({
  getDb: vi.fn(async () => mockDb),
}));

const { ConfigRepository } = await import("@infra/database/ConfigRepository");

describe("ConfigRepository", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDb.select.mockResolvedValue([]);
    mockDb.execute.mockResolvedValue({ rowsAffected: 1, lastInsertId: 0 });
  });

  describe("get", () => {
    it("retorna o valor parseado quando a chave existe", async () => {
      mockDb.select.mockResolvedValue([{ value: JSON.stringify({ x: 100, y: 200 }) }]);
      const repo = new ConfigRepository();
      const result = await repo.get("overlayPosition", { x: 0, y: 0 });
      expect(result).toEqual({ x: 100, y: 200 });
    });

    it("retorna string corretamente", async () => {
      mockDb.select.mockResolvedValue([{ value: JSON.stringify("escuro") }]);
      const repo = new ConfigRepository();
      const result = await repo.get("theme", "azul");
      expect(result).toBe("escuro");
    });

    it("retorna número corretamente", async () => {
      mockDb.select.mockResolvedValue([{ value: JSON.stringify(80) }]);
      const repo = new ConfigRepository();
      const result = await repo.get("overlayOpacity", 100);
      expect(result).toBe(80);
    });

    it("retorna boolean corretamente", async () => {
      mockDb.select.mockResolvedValue([{ value: JSON.stringify(true) }]);
      const repo = new ConfigRepository();
      const result = await repo.get("liveTrayTimer", false);
      expect(result).toBe(true);
    });

    it("retorna defaultValue quando a chave não existe", async () => {
      mockDb.select.mockResolvedValue([]);
      const repo = new ConfigRepository();
      const result = await repo.get("inexistente", 42);
      expect(result).toBe(42);
    });

    it("retorna defaultValue quando o JSON é inválido", async () => {
      mockDb.select.mockResolvedValue([{ value: "não é json" }]);
      const repo = new ConfigRepository();
      const result = await repo.get("corrompida", "fallback");
      expect(result).toBe("fallback");
    });

    it("consulta com a chave correta", async () => {
      const repo = new ConfigRepository();
      await repo.get("minha-chave", null);
      expect(mockDb.select).toHaveBeenCalledWith(expect.stringContaining("WHERE key"), [
        "minha-chave",
      ]);
    });
  });

  describe("set", () => {
    it("serializa objeto como JSON", async () => {
      const repo = new ConfigRepository();
      await repo.set("overlayPosition", { x: 50, y: 75 });
      expect(mockDb.execute).toHaveBeenCalledWith(expect.stringContaining("INSERT"), [
        "overlayPosition",
        JSON.stringify({ x: 50, y: 75 }),
      ]);
    });

    it("serializa string como JSON", async () => {
      const repo = new ConfigRepository();
      await repo.set("theme", "verde");
      expect(mockDb.execute).toHaveBeenCalledWith(expect.anything(), ["theme", '"verde"']);
    });

    it("serializa número como JSON", async () => {
      const repo = new ConfigRepository();
      await repo.set("overlayOpacity", 60);
      expect(mockDb.execute).toHaveBeenCalledWith(expect.anything(), ["overlayOpacity", "60"]);
    });

    it("serializa boolean como JSON", async () => {
      const repo = new ConfigRepository();
      await repo.set("autostart", true);
      expect(mockDb.execute).toHaveBeenCalledWith(expect.anything(), ["autostart", "true"]);
    });

    it("usa upsert (ON CONFLICT)", async () => {
      const repo = new ConfigRepository();
      await repo.set("chave", "valor");
      expect(mockDb.execute).toHaveBeenCalledWith(
        expect.stringMatching(/ON CONFLICT/i),
        expect.anything()
      );
    });
  });

  describe("delete", () => {
    it("executa DELETE com a chave correta", async () => {
      const repo = new ConfigRepository();
      await repo.delete("overlayPosition");
      expect(mockDb.execute).toHaveBeenCalledWith(expect.stringContaining("DELETE"), [
        "overlayPosition",
      ]);
    });
  });
});
