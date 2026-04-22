import { describe, it, expect } from "vitest";
import {
  formatDuration,
  formatDate,
  formatDateTime,
  buildExportRows,
  toCSV,
  toJSON,
} from "@shared/utils/exportFormatter";
import type { ExportProfile } from "@domain/entities/ExportProfile";
import type { Task } from "@domain/entities/Task";
import type { Project } from "@domain/entities/Project";
import type { Category } from "@domain/entities/Category";
import { DEFAULT_COLUMNS } from "@domain/entities/ExportProfile";

function makeProfile(overrides: Partial<ExportProfile> = {}): ExportProfile {
  return {
    id: "p1",
    name: "Padrão",
    isDefault: true,
    format: "csv",
    separator: "comma",
    durationFormat: "hh:mm:ss",
    dateFormat: "iso",
    columns: [...DEFAULT_COLUMNS],
    ...overrides,
  };
}

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: "t1",
    name: "Dev",
    projectId: "proj1",
    categoryId: "cat1",
    billable: true,
    startTime: "2026-04-08T09:00:00.000Z",
    endTime: "2026-04-08T10:00:00.000Z",
    durationSeconds: 3600,
    status: "completed",
    createdAt: "2026-04-08T09:00:00.000Z",
    updatedAt: "2026-04-08T10:00:00.000Z",
    ...overrides,
  };
}

const projects: Project[] = [{ id: "proj1", name: "Projeto A" }];
const categories: Category[] = [{ id: "cat1", name: "Dev", defaultBillable: true }];

describe("formatDuration", () => {
  it("formata hh:mm:ss", () => {
    expect(formatDuration(3661, "hh:mm:ss")).toBe("01:01:01");
  });
  it("formata decimal (horas)", () => {
    expect(formatDuration(3600, "decimal")).toBe("1.00");
    expect(formatDuration(5400, "decimal")).toBe("1.50");
  });
  it("formata minutos", () => {
    expect(formatDuration(3600, "minutes")).toBe("60");
    expect(formatDuration(90, "minutes")).toBe("2");
  });
  it("trata null/0 como zero", () => {
    expect(formatDuration(0, "hh:mm:ss")).toBe("00:00:00");
    expect(formatDuration(0, "decimal")).toBe("0.00");
  });
});

describe("formatDate", () => {
  it("formata ISO mantém YYYY-MM-DD", () => {
    expect(formatDate("2026-04-08T09:00:00.000Z", "iso")).toBe("2026-04-08");
  });
  it("formata dd/mm/yyyy", () => {
    expect(formatDate("2026-04-08T09:00:00.000Z", "dd/mm/yyyy")).toBe("08/04/2026");
  });
  it("retorna vazio para string vazia", () => {
    expect(formatDate("", "iso")).toBe("");
  });
});

describe("formatDateTime", () => {
  it("formata ISO com data e hora (YYYY-MM-DD HH:MM)", () => {
    const result = formatDateTime("2026-04-08T12:00:00.000Z", "iso");
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/);
  });
  it("formata dd/mm/yyyy com hora (DD/MM/YYYY HH:MM)", () => {
    const result = formatDateTime("2026-04-08T12:00:00.000Z", "dd/mm/yyyy");
    expect(result).toMatch(/^\d{2}\/\d{2}\/\d{4} \d{2}:\d{2}$/);
  });
  it("retorna vazio para string vazia", () => {
    expect(formatDateTime("", "iso")).toBe("");
  });
});

describe("buildExportRows", () => {
  it("constrói linhas com colunas visíveis", () => {
    const profile = makeProfile();
    const rows = buildExportRows([makeTask()], profile, projects, categories);
    expect(rows).toHaveLength(1);
    expect(rows[0]["Nome"]).toBe("Dev");
    expect(rows[0]["Projeto"]).toBe("Projeto A");
    expect(rows[0]["Categoria"]).toBe("Dev");
    expect(rows[0]["Billable"]).toBe("Sim");
  });

  it("omite colunas invisíveis", () => {
    const profile = makeProfile({
      columns: DEFAULT_COLUMNS.map((c) => (c.field === "project" ? { ...c, visible: false } : c)),
    });
    const rows = buildExportRows([makeTask()], profile, projects, categories);
    expect(rows[0]["Projeto"]).toBeUndefined();
  });

  it("usa label customizado da coluna", () => {
    const profile = makeProfile({
      columns: DEFAULT_COLUMNS.map((c) => (c.field === "name" ? { ...c, label: "Atividade" } : c)),
    });
    const rows = buildExportRows([makeTask()], profile, projects, categories);
    expect(rows[0]["Atividade"]).toBe("Dev");
  });

  it("exibe (sem nome) para tarefa sem nome", () => {
    const profile = makeProfile();
    const rows = buildExportRows([makeTask({ name: null })], profile, projects, categories);
    expect(rows[0]["Nome"]).toBe("(sem nome)");
  });

  it("formata duração conforme perfil", () => {
    const profile = makeProfile({ durationFormat: "decimal" });
    const rows = buildExportRows([makeTask()], profile, projects, categories);
    expect(rows[0]["Duração"]).toBe("1.00");
  });

  it("formata início como data e hora no formato dd/mm/yyyy", () => {
    const profile = makeProfile({ dateFormat: "dd/mm/yyyy" });
    const rows = buildExportRows([makeTask()], profile, projects, categories);
    // deve conter DD/MM/YYYY HH:MM
    expect(rows[0]["Início"]).toMatch(/^\d{2}\/\d{2}\/\d{4} \d{2}:\d{2}$/);
  });

  it("formata início como data e hora no formato ISO", () => {
    const profile = makeProfile({ dateFormat: "iso" });
    const rows = buildExportRows([makeTask()], profile, projects, categories);
    // deve conter YYYY-MM-DD HH:MM
    expect(rows[0]["Início"]).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/);
  });
});

describe("toCSV", () => {
  it("gera cabeçalho e linha com vírgula", () => {
    const rows = [{ Nome: "Dev", Projeto: "A" }];
    const csv = toCSV(rows, "comma");
    expect(csv).toContain("Nome,Projeto");
    expect(csv).toContain("Dev,A");
  });

  it("gera cabeçalho e linha com ponto-e-vírgula", () => {
    const rows = [{ Nome: "Dev", Projeto: "A" }];
    const csv = toCSV(rows, "semicolon");
    expect(csv).toContain("Nome;Projeto");
    expect(csv).toContain("Dev;A");
  });

  it("escapa aspas duplas no valor", () => {
    const rows = [{ Nome: 'Dev "frontend"' }];
    const csv = toCSV(rows, "comma");
    expect(csv).toContain('"Dev ""frontend"""');
  });

  it("retorna string vazia para lista vazia", () => {
    expect(toCSV([], "comma")).toBe("");
  });
});

describe("toJSON", () => {
  it("serializa rows como array JSON formatado", () => {
    const rows = [{ Nome: "Dev" }];
    const json = toJSON(rows);
    const parsed = JSON.parse(json) as unknown[];
    expect(parsed).toHaveLength(1);
    expect((parsed[0] as Record<string, string>)["Nome"]).toBe("Dev");
  });
});
