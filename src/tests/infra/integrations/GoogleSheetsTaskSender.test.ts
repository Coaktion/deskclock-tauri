import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Task } from "@domain/entities/Task";
import type { Project } from "@domain/entities/Project";
import type { Category } from "@domain/entities/Category";
import type { AppConfig, ConfigContextValue } from "@presentation/contexts/ConfigContext";
import type { TaskField } from "@shared/types/sheetsConfig";

vi.stubEnv("GCP_CLIENT_ID", "test-client-id");
vi.stubEnv("GCP_CLIENT_SECRET", "test-client-secret");

// Mock do GoogleTokenManager para isolar os testes da camada de rede
vi.mock("@infra/integrations/google/GoogleTokenManager", () => ({
  GoogleTokenManager: vi.fn().mockImplementation(() => ({
    getValidAccessToken: vi.fn().mockResolvedValue("test-token"),
  })),
}));

const { GoogleSheetsTaskSender, colLetter } = await import(
  "@infra/integrations/GoogleSheetsTaskSender"
);

function makeConfig(overrides: Partial<AppConfig> = {}): ConfigContextValue {
  const store: Partial<AppConfig> = {
    integrationGoogleSheetsSheetName: "DeskClock",
    integrationGoogleSheetsColumnMapping: [
      { field: "date", label: "Data", enabled: true },
      { field: "name", label: "Nome", enabled: true },
      { field: "project", label: "Projeto", enabled: true },
      { field: "category", label: "Categoria", enabled: true },
      { field: "billable", label: "Billable", enabled: true },
      { field: "startTime", label: "Início", enabled: true },
      { field: "endTime", label: "Fim", enabled: true },
      { field: "duration", label: "Duração", enabled: true },
    ],
    ...overrides,
  };
  return {
    isLoaded: true,
    get: vi.fn(<K extends keyof AppConfig>(key: K) => store[key] as AppConfig[K]),
    set: vi.fn(),
  };
}

const projects: Project[] = [
  { id: "proj-1", name: "Projeto Alpha" },
  { id: "proj-2", name: "Projeto Beta" },
];

const categories: Category[] = [
  { id: "cat-1", name: "Desenvolvimento", defaultBillable: true },
  { id: "cat-2", name: "Reuniões", defaultBillable: false },
];

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: "task-1",
    name: "Tarefa teste",
    projectId: "proj-1",
    categoryId: "cat-1",
    billable: true,
    startTime: "2026-04-15T09:00:00.000Z",
    endTime: "2026-04-15T10:30:00.000Z",
    durationSeconds: 5400,
    status: "completed",
    sentToSheets: false,
    createdAt: "2026-04-15T09:00:00.000Z",
    updatedAt: "2026-04-15T10:30:00.000Z",
    ...overrides,
  };
}

// Acessa taskToRow via cast para testar o método privado diretamente
function callTaskToRow(sender: InstanceType<typeof GoogleSheetsTaskSender>, task: Task, fields: TaskField[]) {
  return (sender as unknown as { taskToRow(t: Task, f: TaskField[]): (string | number)[] }).taskToRow(task, fields);
}

describe("colLetter", () => {
  it("1 → A", () => expect(colLetter(1)).toBe("A"));
  it("2 → B", () => expect(colLetter(2)).toBe("B"));
  it("26 → Z", () => expect(colLetter(26)).toBe("Z"));
  it("27 → AA", () => expect(colLetter(27)).toBe("AA"));
  it("28 → AB", () => expect(colLetter(28)).toBe("AB"));
  it("52 → AZ", () => expect(colLetter(52)).toBe("AZ"));
  it("53 → BA", () => expect(colLetter(53)).toBe("BA"));
  it("702 → ZZ", () => expect(colLetter(702)).toBe("ZZ"));
  it("703 → AAA", () => expect(colLetter(703)).toBe("AAA"));
});

describe("GoogleSheetsTaskSender — taskToRow", () => {
  let sender: InstanceType<typeof GoogleSheetsTaskSender>;

  beforeEach(() => {
    sender = new GoogleSheetsTaskSender(makeConfig(), "sheet-id", projects, categories);
  });

  it("retorna data no formato DD/MM/AAAA", () => {
    const task = makeTask({ startTime: "2026-04-15T09:00:00.000Z" });
    // Usa fuso local do ambiente de teste — constrói a data local esperada
    const d = new Date("2026-04-15T09:00:00.000Z");
    const expected = `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
    const row = callTaskToRow(sender, task, ["date"]);
    expect(row[0]).toBe(expected);
  });

  it("retorna nome da tarefa", () => {
    const row = callTaskToRow(sender, makeTask({ name: "Minha tarefa" }), ["name"]);
    expect(row[0]).toBe("Minha tarefa");
  });

  it("retorna '(sem nome)' quando name é null", () => {
    const row = callTaskToRow(sender, makeTask({ name: null }), ["name"]);
    expect(row[0]).toBe("(sem nome)");
  });

  it("retorna nome do projeto resolvido", () => {
    const row = callTaskToRow(sender, makeTask({ projectId: "proj-2" }), ["project"]);
    expect(row[0]).toBe("Projeto Beta");
  });

  it("retorna string vazia quando projeto não existe", () => {
    const row = callTaskToRow(sender, makeTask({ projectId: null }), ["project"]);
    expect(row[0]).toBe("");
  });

  it("retorna nome da categoria resolvida", () => {
    const row = callTaskToRow(sender, makeTask({ categoryId: "cat-2" }), ["category"]);
    expect(row[0]).toBe("Reuniões");
  });

  it("retorna string vazia quando categoria não existe", () => {
    const row = callTaskToRow(sender, makeTask({ categoryId: null }), ["category"]);
    expect(row[0]).toBe("");
  });

  it("retorna 'Sim' para tarefa billable", () => {
    const row = callTaskToRow(sender, makeTask({ billable: true }), ["billable"]);
    expect(row[0]).toBe("Sim");
  });

  it("retorna 'Não' para tarefa non-billable", () => {
    const row = callTaskToRow(sender, makeTask({ billable: false }), ["billable"]);
    expect(row[0]).toBe("Não");
  });

  it("retorna hora de início no formato HH:MM", () => {
    const task = makeTask({ startTime: "2026-04-15T09:30:00.000Z" });
    const d = new Date("2026-04-15T09:30:00.000Z");
    const expected = `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
    const row = callTaskToRow(sender, task, ["startTime"]);
    expect(row[0]).toBe(expected);
  });

  it("retorna hora de fim quando endTime está preenchido", () => {
    const task = makeTask({ endTime: "2026-04-15T10:30:00.000Z" });
    const d = new Date("2026-04-15T10:30:00.000Z");
    const expected = `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
    const row = callTaskToRow(sender, task, ["endTime"]);
    expect(row[0]).toBe(expected);
  });

  it("retorna string vazia para endTime null", () => {
    const row = callTaskToRow(sender, makeTask({ endTime: null }), ["endTime"]);
    expect(row[0]).toBe("");
  });

  it("retorna duração como fração de dia", () => {
    const row = callTaskToRow(sender, makeTask({ durationSeconds: 5400 }), ["duration"]);
    expect(row[0]).toBeCloseTo(5400 / 86400);
  });

  it("retorna string vazia para durationSeconds null", () => {
    const row = callTaskToRow(sender, makeTask({ durationSeconds: null }), ["duration"]);
    expect(row[0]).toBe("");
  });

  it("monta linha completa com todos os campos na ordem correta", () => {
    const task = makeTask({
      name: "Alpha",
      projectId: "proj-1",
      categoryId: "cat-1",
      billable: true,
      durationSeconds: 3600,
      endTime: "2026-04-15T10:00:00.000Z",
    });
    const fields: TaskField[] = ["name", "project", "category", "billable", "duration"];
    const row = callTaskToRow(sender, task, fields);
    expect(row).toHaveLength(5);
    expect(row[0]).toBe("Alpha");
    expect(row[1]).toBe("Projeto Alpha");
    expect(row[2]).toBe("Desenvolvimento");
    expect(row[3]).toBe("Sim");
    expect(row[4]).toBeCloseTo(3600 / 86400);
  });
});
