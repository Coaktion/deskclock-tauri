import { describe, it, expect, vi } from "vitest";
import { createCustomField } from "@domain/usecases/customFields/CreateCustomField";
import type { ICustomFieldRepository } from "@domain/repositories/ICustomFieldRepository";
import { DomainError, DuplicateNameError } from "@shared/errors";

const NOW = "2026-07-31T12:00:00.000Z";

function makeRepo(overrides: Partial<ICustomFieldRepository> = {}): ICustomFieldRepository {
  return {
    findAll: vi.fn(async () => []),
    findById: vi.fn(async () => null),
    findByLabel: vi.fn(async () => null),
    save: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    ...overrides,
  };
}

describe("createCustomField", () => {
  it("cria um campo de texto com o label aparado", async () => {
    const repo = makeRepo();
    const field = await createCustomField(repo, { label: "  Stage  ", type: "text" }, NOW);
    expect(field.label).toBe("Stage");
    expect(field.options).toEqual([]);
    expect(field.archived).toBe(false);
    expect(repo.save).toHaveBeenCalledWith(field);
  });

  it("rejeita label vazio", async () => {
    await expect(createCustomField(makeRepo(), { label: "  ", type: "text" }, NOW)).rejects.toThrow(
      DomainError
    );
  });

  it("rejeita label duplicado", async () => {
    const repo = makeRepo({
      findByLabel: vi.fn(async () => ({
        id: "f1",
        label: "Stage",
        type: "text" as const,
        options: [],
        sortOrder: 0,
        archived: false,
        createdAt: NOW,
      })),
    });
    await expect(createCustomField(repo, { label: "Stage", type: "text" }, NOW)).rejects.toThrow(
      DuplicateNameError
    );
  });

  it("gera um id por opção do select e ignora duplicatas e vazios", async () => {
    const field = await createCustomField(
      makeRepo(),
      { label: "Stage", type: "select", optionLabels: ["A", " ", "B", "A"] },
      NOW
    );
    expect(field.options.map((o) => o.label)).toEqual(["A", "B"]);
    expect(new Set(field.options.map((o) => o.id)).size).toBe(2);
  });

  it("rejeita select sem opção", async () => {
    await expect(
      createCustomField(makeRepo(), { label: "Stage", type: "select", optionLabels: [] }, NOW)
    ).rejects.toThrow(DomainError);
  });

  it("põe o campo novo no fim da ordenação", async () => {
    const repo = makeRepo({
      findAll: vi.fn(async () => [
        {
          id: "a",
          label: "A",
          type: "text" as const,
          options: [],
          sortOrder: 0,
          archived: false,
          createdAt: NOW,
        },
        {
          id: "b",
          label: "B",
          type: "text" as const,
          options: [],
          sortOrder: 1,
          archived: false,
          createdAt: NOW,
        },
      ]),
    });
    const field = await createCustomField(repo, { label: "C", type: "text" }, NOW);
    expect(field.sortOrder).toBe(2);
  });
});
