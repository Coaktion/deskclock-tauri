import { describe, it, expect } from "vitest";
import {
  validateTaskForSheets,
  validateTaskForClockify,
  formatMissingFields,
} from "@domain/integrations/taskValidation";
import type { Task } from "@domain/entities/Task";

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: "t1",
    name: "Tarefa",
    projectId: "p1",
    categoryId: "c1",
    billable: true,
    startTime: "2026-04-30T09:00:00Z",
    endTime: "2026-04-30T10:00:00Z",
    durationSeconds: 3600,
    status: "completed",
    createdAt: "2026-04-30T09:00:00Z",
    updatedAt: "2026-04-30T10:00:00Z",
    ...overrides,
  };
}

describe("validateTaskForSheets", () => {
  it("retorna ok quando nome, projeto e categoria estão preenchidos", () => {
    expect(validateTaskForSheets(makeTask())).toEqual({ ok: true, missing: [] });
  });

  it("acusa nome faltante quando vazio ou nulo", () => {
    expect(validateTaskForSheets(makeTask({ name: null })).missing).toContain("nome");
    expect(validateTaskForSheets(makeTask({ name: "" })).missing).toContain("nome");
    expect(validateTaskForSheets(makeTask({ name: "   " })).missing).toContain("nome");
  });

  it("acusa projeto faltante quando projectId é nulo", () => {
    expect(validateTaskForSheets(makeTask({ projectId: null })).missing).toContain("projeto");
  });

  it("acusa categoria faltante quando categoryId é nulo", () => {
    expect(validateTaskForSheets(makeTask({ categoryId: null })).missing).toContain("categoria");
  });

  it("acumula múltiplos campos faltantes", () => {
    const r = validateTaskForSheets(makeTask({ name: null, projectId: null, categoryId: null }));
    expect(r.ok).toBe(false);
    expect(r.missing).toEqual(["nome", "projeto", "categoria"]);
  });
});

describe("validateTaskForClockify", () => {
  it("retorna ok com nome e projeto, mesmo sem categoria", () => {
    expect(validateTaskForClockify(makeTask({ categoryId: null })).ok).toBe(true);
  });

  it("não exige categoria nem billable nem tags", () => {
    const r = validateTaskForClockify(makeTask({ categoryId: null, billable: false }));
    expect(r.ok).toBe(true);
  });

  it("exige nome", () => {
    expect(validateTaskForClockify(makeTask({ name: null })).missing).toEqual(["nome"]);
  });

  it("exige projeto", () => {
    expect(validateTaskForClockify(makeTask({ projectId: null })).missing).toEqual(["projeto"]);
  });

  it("acusa ambos quando faltam", () => {
    const r = validateTaskForClockify(makeTask({ name: "", projectId: null }));
    expect(r).toEqual({ ok: false, missing: ["nome", "projeto"] });
  });
});

describe("formatMissingFields", () => {
  it("vazio quando não há nada", () => {
    expect(formatMissingFields([])).toBe("");
  });

  it("um campo", () => {
    expect(formatMissingFields(["nome"])).toBe("nome");
  });

  it("dois campos com 'e'", () => {
    expect(formatMissingFields(["nome", "projeto"])).toBe("nome e projeto");
  });

  it("três ou mais campos com vírgula e 'e' no final", () => {
    expect(formatMissingFields(["nome", "projeto", "categoria"])).toBe("nome, projeto e categoria");
  });
});
