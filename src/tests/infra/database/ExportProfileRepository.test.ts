import { describe, it, expect, vi, beforeEach } from "vitest";
import type { ExportProfile } from "@domain/entities/ExportProfile";
import { DEFAULT_COLUMNS } from "@domain/entities/ExportProfile";

const mockDb = { select: vi.fn(), execute: vi.fn() };
vi.mock("@infra/database/db", () => ({ getDb: vi.fn(async () => mockDb) }));

const { ExportProfileRepository } = await import("@infra/database/ExportProfileRepository");

function makeRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: "ep1", name: "Padrão", is_default: 1, format: "csv",
    separator: "comma", duration_format: "hh:mm:ss", date_format: "iso",
    columns: JSON.stringify(DEFAULT_COLUMNS),
    ...overrides,
  };
}

function makeProfile(overrides: Partial<ExportProfile> = {}): ExportProfile {
  return {
    id: "ep1", name: "Padrão", isDefault: true, format: "csv",
    separator: "comma", durationFormat: "hh:mm:ss", dateFormat: "iso",
    columns: [...DEFAULT_COLUMNS],
    ...overrides,
  };
}

describe("ExportProfileRepository", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDb.select.mockResolvedValue([]);
    mockDb.execute.mockResolvedValue({ rowsAffected: 1 });
  });

  describe("findAll", () => {
    it("retorna lista mapeada", async () => {
      mockDb.select.mockResolvedValue([makeRow()]);
      const repo = new ExportProfileRepository();
      const result = await repo.findAll();
      expect(result).toHaveLength(1);
      expect(result[0].isDefault).toBe(true);
      expect(result[0].columns).toEqual(DEFAULT_COLUMNS);
    });
  });

  describe("findById", () => {
    it("retorna perfil quando encontrado", async () => {
      mockDb.select.mockResolvedValue([makeRow()]);
      const repo = new ExportProfileRepository();
      const result = await repo.findById("ep1");
      expect(result?.id).toBe("ep1");
    });
    it("retorna null quando não encontrado", async () => {
      const repo = new ExportProfileRepository();
      expect(await repo.findById("x")).toBeNull();
    });
  });

  describe("findDefault", () => {
    it("retorna perfil padrão", async () => {
      mockDb.select.mockResolvedValue([makeRow()]);
      const repo = new ExportProfileRepository();
      const result = await repo.findDefault();
      expect(result?.isDefault).toBe(true);
    });
  });

  describe("save", () => {
    it("executa INSERT com serialização correta", async () => {
      const repo = new ExportProfileRepository();
      await repo.save(makeProfile());
      expect(mockDb.execute).toHaveBeenCalledWith(
        expect.stringContaining("INSERT"),
        expect.arrayContaining(["ep1", "Padrão"])
      );
    });
    it("serializa columns como JSON", async () => {
      const repo = new ExportProfileRepository();
      await repo.save(makeProfile());
      const args = mockDb.execute.mock.calls[0][1] as unknown[];
      const columnsArg = args.find((a) => typeof a === "string" && a.startsWith("["));
      expect(columnsArg).toBeTruthy();
      expect(() => JSON.parse(columnsArg as string)).not.toThrow();
    });
  });

  describe("setDefault", () => {
    it("zera is_default e define novo padrão", async () => {
      const repo = new ExportProfileRepository();
      await repo.setDefault("ep1");
      expect(mockDb.execute).toHaveBeenCalledTimes(2);
      expect(mockDb.execute.mock.calls[0][0]).toContain("is_default = 0");
      expect(mockDb.execute.mock.calls[1][1]).toContain("ep1");
    });
  });

  describe("delete", () => {
    it("executa DELETE com o id correto", async () => {
      const repo = new ExportProfileRepository();
      await repo.delete("ep1");
      expect(mockDb.execute).toHaveBeenCalledWith(expect.stringContaining("DELETE"), ["ep1"]);
    });
  });
});
