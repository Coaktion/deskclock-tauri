import { describe, it, expect, vi, beforeEach } from "vitest";
import type { CustomField } from "@domain/entities/CustomField";

const mockDb = {
  select: vi.fn(),
  execute: vi.fn(),
};

vi.mock("@infra/database/db", () => ({
  getDb: vi.fn(async () => mockDb),
}));

const { CustomFieldRepository } = await import("@infra/database/CustomFieldRepository");

function makeRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: "f1",
    label: "Project Stage",
    type: "select",
    options: '[{"id":"o1","label":"Discovery"}]',
    sort_order: 0,
    archived: 0,
    created_at: "2026-07-31T00:00:00.000Z",
    ...overrides,
  };
}

function makeField(overrides: Partial<CustomField> = {}): CustomField {
  return {
    id: "f1",
    label: "Project Stage",
    type: "select",
    options: [{ id: "o1", label: "Discovery" }],
    sortOrder: 0,
    archived: false,
    createdAt: "2026-07-31T00:00:00.000Z",
    ...overrides,
  };
}

describe("CustomFieldRepository", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDb.select.mockResolvedValue([]);
    mockDb.execute.mockResolvedValue({ rowsAffected: 1, lastInsertId: 0 });
  });

  it("desserializa options e archived", async () => {
    mockDb.select.mockResolvedValue([makeRow({ archived: 1 })]);
    const field = await new CustomFieldRepository().findById("f1");
    expect(field).toEqual(makeField({ archived: true }));
  });

  it("ordena por sort_order e desempata por created_at", async () => {
    await new CustomFieldRepository().findAll();
    expect(mockDb.select.mock.calls[0][0]).toContain("ORDER BY sort_order ASC, created_at ASC");
  });

  it("serializa options como JSON ao salvar", async () => {
    await new CustomFieldRepository().save(makeField());
    expect(mockDb.execute.mock.calls[0][1]).toContain('[{"id":"o1","label":"Discovery"}]');
  });

  it("não atualiza o type — mudá-lo reinterpretaria valores já gravados", async () => {
    await new CustomFieldRepository().update(makeField({ label: "Stage" }));
    expect(mockDb.execute.mock.calls[0][0]).not.toContain("type");
  });

  it("devolve null quando o campo não existe", async () => {
    expect(await new CustomFieldRepository().findByLabel("nada")).toBeNull();
  });
});
