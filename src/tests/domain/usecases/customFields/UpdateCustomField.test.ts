import { describe, it, expect, vi } from "vitest";
import { updateCustomField } from "@domain/usecases/customFields/UpdateCustomField";
import type { ICustomFieldRepository } from "@domain/repositories/ICustomFieldRepository";
import type { CustomField } from "@domain/entities/CustomField";
import { DomainError } from "@shared/errors";

const NOW = "2026-07-31T12:00:00.000Z";

function makeField(overrides: Partial<CustomField> = {}): CustomField {
  return {
    id: "f1",
    label: "Stage",
    type: "select",
    options: [
      { id: "o1", label: "Discovery" },
      { id: "o2", label: "Delivery" },
    ],
    sortOrder: 0,
    archived: false,
    createdAt: NOW,
    ...overrides,
  };
}

function makeRepo(field: CustomField | null): ICustomFieldRepository {
  return {
    findAll: vi.fn(async () => (field ? [field] : [])),
    findById: vi.fn(async () => field),
    findByLabel: vi.fn(async () => null),
    save: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  };
}

describe("updateCustomField", () => {
  it("preserva o id das opções que continuam existindo", async () => {
    const repo = makeRepo(makeField());
    const updated = await updateCustomField(repo, "f1", {
      optionLabels: ["Delivery", "Discovery", "Rollout"],
    });
    expect(updated.options.map((o) => o.label)).toEqual(["Delivery", "Discovery", "Rollout"]);
    // O valor gravado na tarefa É o id da opção: reciclá-lo apagaria histórico.
    expect(updated.options[0].id).toBe("o2");
    expect(updated.options[1].id).toBe("o1");
    expect(["o1", "o2"]).not.toContain(updated.options[2].id);
  });

  it("arquiva sem tocar nas opções", async () => {
    const repo = makeRepo(makeField());
    const updated = await updateCustomField(repo, "f1", { archived: true });
    expect(updated.archived).toBe(true);
    expect(updated.options).toHaveLength(2);
  });

  it("rejeita deixar um select sem opção", async () => {
    const repo = makeRepo(makeField());
    await expect(updateCustomField(repo, "f1", { optionLabels: [] })).rejects.toThrow(DomainError);
  });

  it("ignora optionLabels em campo que não é select", async () => {
    const repo = makeRepo(makeField({ type: "text", options: [] }));
    const updated = await updateCustomField(repo, "f1", { optionLabels: ["A"] });
    expect(updated.options).toEqual([]);
  });

  it("falha quando o campo não existe", async () => {
    await expect(updateCustomField(makeRepo(null), "f1", { label: "X" })).rejects.toThrow(
      DomainError
    );
  });
});
