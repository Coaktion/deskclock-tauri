import { describe, it, expect } from "vitest";
import type { Category } from "@domain/entities/Category";
import type { CustomField } from "@domain/entities/CustomField";
import type { Project } from "@domain/entities/Project";
import { resolveSharedPayload } from "@domain/utils/resolveSharedPayload";
import type { SharedTaskPayload } from "@shared/utils/shareLink";

function makePayload(overrides: Partial<SharedTaskPayload> = {}): SharedTaskPayload {
  return {
    name: "Revisão de PRs",
    billable: true,
    customValues: {},
    ...overrides,
  };
}

function makeField(overrides: Partial<CustomField> = {}): CustomField {
  return {
    id: "f1",
    label: "Ticket",
    type: "text",
    options: [],
    sortOrder: 0,
    archived: false,
    createdAt: "2026-09-01T12:00:00.000Z",
    ...overrides,
  };
}

const projects: Project[] = [{ id: "p1", workspaceId: "w1", name: "Cliente A", colorIndex: 0 }];
const categories: Category[] = [
  { id: "c1", workspaceId: "w1", name: "Desenvolvimento", defaultBillable: true },
];

describe("resolveSharedPayload", () => {
  it("casa projeto e categoria pelo nome, ignorando caixa e espaços", () => {
    const resolved = resolveSharedPayload(
      makePayload({ projectName: "  cliente a ", categoryName: "DESENVOLVIMENTO" }),
      projects,
      categories,
      []
    );

    expect(resolved.projectId).toBe("p1");
    expect(resolved.categoryId).toBe("c1");
    expect(resolved.unresolved).toEqual({ projects: [], categories: [], customFields: [] });
  });

  it("copia nome, faturamento e horários do payload", () => {
    const resolved = resolveSharedPayload(
      makePayload({ billable: false, startTime: "09:00", endTime: "10:30" }),
      projects,
      categories,
      []
    );

    expect(resolved.name).toBe("Revisão de PRs");
    expect(resolved.billable).toBe(false);
    expect(resolved.startTime).toBe("09:00");
    expect(resolved.endTime).toBe("10:30");
  });

  it("sem horário no link, os campos de hora nascem vazios", () => {
    const resolved = resolveSharedPayload(makePayload(), projects, categories, []);
    expect(resolved.startTime).toBe("");
    expect(resolved.endTime).toBe("");
  });

  it("projeto que não existe aqui zera o id e entra em unresolved", () => {
    const resolved = resolveSharedPayload(
      makePayload({ projectName: "Cliente Z" }),
      projects,
      categories,
      []
    );

    expect(resolved.projectId).toBeNull();
    expect(resolved.unresolved.projects).toEqual(["Cliente Z"]);
  });

  it("categoria que não existe aqui zera o id e entra em unresolved", () => {
    const resolved = resolveSharedPayload(
      makePayload({ categoryName: "Suporte" }),
      projects,
      categories,
      []
    );

    expect(resolved.categoryId).toBeNull();
    expect(resolved.unresolved.categories).toEqual(["Suporte"]);
  });

  it("casa o campo personalizado pelo rótulo e grava o valor já serializado", () => {
    const fields = [
      makeField({ id: "f-text", label: "Ticket" }),
      makeField({ id: "f-check", label: "Urgente", type: "checkbox" }),
      makeField({
        id: "f-sel",
        label: "Etapa",
        type: "select",
        options: [
          { id: "o1", label: "Discovery" },
          { id: "o2", label: "Delivery" },
        ],
      }),
    ];

    const resolved = resolveSharedPayload(
      makePayload({
        customValues: { " ticket ": "ABC-1", Urgente: "Sim", etapa: "Delivery" },
      }),
      projects,
      categories,
      fields
    );

    expect(resolved.customValues).toEqual({
      "f-text": "ABC-1",
      "f-check": "1",
      "f-sel": "o2",
    });
    expect(resolved.unresolved.customFields).toEqual([]);
  });

  it("rótulo de campo que não existe aqui entra em unresolved", () => {
    const resolved = resolveSharedPayload(
      makePayload({ customValues: { "Campo fantasma": "x" } }),
      projects,
      categories,
      [makeField()]
    );

    expect(resolved.customValues).toEqual({});
    expect(resolved.unresolved.customFields).toEqual(["Campo fantasma"]);
  });

  it("campo que existe mas cujo valor não resolve também entra em unresolved", () => {
    const fields = [
      makeField({
        id: "f-sel",
        label: "Etapa",
        type: "select",
        options: [{ id: "o1", label: "Discovery" }],
      }),
      makeField({ id: "f-check", label: "Urgente", type: "checkbox" }),
    ];

    const resolved = resolveSharedPayload(
      makePayload({ customValues: { Etapa: "Opção apagada", Urgente: "Não" } }),
      projects,
      categories,
      fields
    );

    expect(resolved.customValues).toEqual({});
    expect(resolved.unresolved.customFields).toEqual(["Etapa", "Urgente"]);
  });
});
