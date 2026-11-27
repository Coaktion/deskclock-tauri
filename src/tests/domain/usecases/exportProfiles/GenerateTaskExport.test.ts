import { describe, it, expect, vi } from "vitest";
import type { ITaskRepository } from "@domain/repositories/ITaskRepository";
import type { ExportProfile } from "@domain/entities/ExportProfile";
import { DEFAULT_COLUMNS } from "@domain/entities/ExportProfile";
import type { Task } from "@domain/entities/Task";
import type { CustomField } from "@domain/entities/CustomField";
import {
  generateTaskExport,
  loadTasksForExport,
  mergeTasksForExport,
  resolveExportProfile,
} from "@domain/usecases/exportProfiles/GenerateTaskExport";
import { customColumnField, withCustomColumns } from "@domain/utils/exportFormatter";
import { endOfDayISO, startOfDayISO } from "@shared/utils/time";
import { localISO } from "../../../helpers/localTime";

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: "t-1",
    workspaceId: "ws",
    name: "Reunião",
    projectId: "p-1",
    categoryId: null,
    billable: true,
    startTime: localISO(2026, 10, 1, 9),
    endTime: localISO(2026, 10, 1, 10),
    durationSeconds: 3600,
    status: "completed",
    createdAt: localISO(2026, 10, 1, 9),
    updatedAt: localISO(2026, 10, 1, 10),
    plannedTaskId: null,
    customValues: {},
    ...overrides,
  };
}

function makeProfile(overrides: Partial<ExportProfile> = {}): ExportProfile {
  return {
    id: "prof-1",
    workspaceId: "ws",
    name: "Padrão",
    isDefault: false,
    format: "csv",
    separator: "comma",
    durationFormat: "hh:mm:ss",
    dateFormat: "iso",
    columns: [...DEFAULT_COLUMNS],
    ...overrides,
  };
}

const CATALOGS = {
  projects: [{ id: "p-1", workspaceId: "ws", name: "Cliente", colorIndex: 0 }],
  categories: [],
  customFields: [],
};

describe("resolveExportProfile", () => {
  const a = makeProfile({ id: "a" });
  const b = makeProfile({ id: "b", isDefault: true });

  it("usa o escolhido, senão o padrão, senão o primeiro", () => {
    expect(resolveExportProfile([a, b], "a")).toBe(a);
    expect(resolveExportProfile([a, b], "")).toBe(b);
    expect(resolveExportProfile([a, b], "inexistente")).toBe(b);
    expect(resolveExportProfile([a, makeProfile({ id: "c" })])).toBe(a);
    expect(resolveExportProfile([])).toBeUndefined();
  });
});

describe("loadTasksForExport", () => {
  it("busca nos limites do dia local e devolve só as concluídas", async () => {
    const done = makeTask();
    const running = makeTask({ id: "t-2", status: "running" });
    const findByDateRange = vi.fn(async () => [done, running]);
    const repo = { findByDateRange } as unknown as ITaskRepository;

    const tasks = await loadTasksForExport(repo, {
      from: "2026-10-01",
      to: "2026-10-03",
      workspaceId: "ws",
    });

    expect(tasks).toEqual([done]);
    expect(findByDateRange).toHaveBeenCalledWith(
      startOfDayISO("2026-10-01"),
      endOfDayISO("2026-10-03"),
      "ws"
    );
  });

  it("sem workspace busca em todos, como o modal", async () => {
    const findByDateRange = vi.fn(
      async (_start: string, _end: string, _ws?: string): Promise<Task[]> => []
    );
    await loadTasksForExport({ findByDateRange } as unknown as ITaskRepository, {
      from: "2026-10-01",
      to: "2026-10-01",
    });
    expect(findByDateRange.mock.calls[0]).toHaveLength(3);
    expect(findByDateRange.mock.calls[0][2]).toBeUndefined();
  });
});

describe("mergeTasksForExport", () => {
  it("soma a duração do grupo num registro, com os dados da primeira tarefa", () => {
    const first = makeTask({ id: "t-1", durationSeconds: 600 });
    const second = makeTask({
      id: "t-2",
      durationSeconds: 900,
      startTime: localISO(2026, 10, 1, 14),
    });
    const other = makeTask({ id: "t-3", name: "Outra", durationSeconds: 60 });

    const merged = mergeTasksForExport([first, other, second]);

    expect(merged).toEqual([{ ...first, durationSeconds: 1500 }, other]);
  });

  it("valores personalizados diferentes não agrupam", () => {
    const a = makeTask({ id: "a", customValues: { f: "1" } });
    const b = makeTask({ id: "b", customValues: { f: "2" } });
    expect(mergeTasksForExport([a, b])).toEqual([a, b]);
  });
});

describe("generateTaskExport", () => {
  it("gera o CSV pelo perfil, com nome e tipo do arquivo", () => {
    const profile = makeProfile({
      separator: "semicolon",
      durationFormat: "decimal",
      columns: [
        { field: "durationSeconds", label: "Horas", visible: true, order: 1 },
        { field: "name", label: "Tarefa", visible: true, order: 0 },
        { field: "project", label: "Projeto", visible: false, order: 2 },
      ],
    });

    const result = generateTaskExport([makeTask()], profile, CATALOGS);

    expect(result).toEqual({
      content: "Tarefa;Horas\nReunião;1.00",
      fileName: "export.csv",
      format: "csv",
      mimeType: "text/csv",
      rowCount: 1,
    });
  });

  it("gera o JSON e conta as linhas", () => {
    const profile = makeProfile({
      format: "json",
      columns: [{ field: "project", label: "Projeto", visible: true, order: 0 }],
    });
    const result = generateTaskExport([makeTask(), makeTask({ id: "t-2" })], profile, CATALOGS);
    expect(result.content).toBe(
      JSON.stringify([{ Projeto: "Cliente" }, { Projeto: "Cliente" }], null, 2)
    );
    expect(result).toMatchObject({ fileName: "export.json", mimeType: "application/json" });
    expect(result.rowCount).toBe(2);
  });

  it("sem tarefas: CSV vazio e zero linhas", () => {
    expect(generateTaskExport([], makeProfile(), CATALOGS)).toMatchObject({
      content: "",
      rowCount: 0,
    });
  });
});

describe("withCustomColumns", () => {
  const field: CustomField = {
    id: "f-1",
    label: "Etapa",
    type: "text",
    options: [],
    sortOrder: 0,
    archived: false,
    createdAt: localISO(2026, 9, 1, 8),
  };

  it("acrescenta o campo que falta, invisível, no fim", () => {
    const columns = withCustomColumns([...DEFAULT_COLUMNS], [field]);
    expect(columns.at(-1)).toEqual({
      field: customColumnField("f-1"),
      label: "Etapa",
      visible: false,
      order: DEFAULT_COLUMNS.length,
    });
  });

  it("não duplica a coluna que já existe", () => {
    const existing = [{ field: customColumnField("f-1"), label: "X", visible: true, order: 0 }];
    expect(withCustomColumns(existing, [field])).toEqual(existing);
  });
});
