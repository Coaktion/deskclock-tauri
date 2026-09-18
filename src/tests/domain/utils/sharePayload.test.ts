import { describe, it, expect } from "vitest";
import type { PlannedTask } from "@domain/entities/PlannedTask";
import type { CustomField } from "@domain/entities/CustomField";
import type { Project } from "@domain/entities/Project";
import type { Category } from "@domain/entities/Category";
import { plannedTaskToSharePayload } from "@domain/utils/sharePayload";

function makeTask(overrides: Partial<PlannedTask> = {}): PlannedTask {
  return {
    id: "t1",
    workspaceId: "w1",
    name: "Revisão de PRs",
    projectId: null,
    categoryId: null,
    billable: true,
    scheduleType: "specific_date",
    scheduleDate: "2026-09-18",
    recurringDays: null,
    periodStart: null,
    periodEnd: null,
    completedDates: [],
    actions: [],
    sortOrder: 0,
    createdAt: "2026-09-18T12:00:00.000Z",
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

describe("plannedTaskToSharePayload", () => {
  it("resolve projeto e categoria pelo nome do catálogo", () => {
    const payload = plannedTaskToSharePayload(
      makeTask({ projectId: "p1", categoryId: "c1" }),
      projects,
      categories,
      []
    );

    expect(payload.projectName).toBe("Cliente A");
    expect(payload.categoryName).toBe("Desenvolvimento");
  });

  it("deixa projeto e categoria ausentes quando o id é nulo ou não está no catálogo", () => {
    const payload = plannedTaskToSharePayload(
      makeTask({ projectId: "sumiu", categoryId: null }),
      projects,
      categories,
      []
    );

    expect(payload.projectName).toBeUndefined();
    expect(payload.categoryName).toBeUndefined();
  });

  it("leva nome, faturamento e o par de horários", () => {
    const payload = plannedTaskToSharePayload(
      makeTask({ billable: false, startTime: "09:00", endTime: "10:30" }),
      [],
      [],
      []
    );

    expect(payload.name).toBe("Revisão de PRs");
    expect(payload.billable).toBe(false);
    expect(payload.startTime).toBe("09:00");
    expect(payload.endTime).toBe("10:30");
  });

  it("indexa o campo personalizado pelo rótulo, não pelo id", () => {
    const payload = plannedTaskToSharePayload(
      makeTask({ customValues: { f1: "ABC-123" } }),
      [],
      [],
      [makeField()]
    );

    expect(payload.customValues).toEqual({ Ticket: "ABC-123" });
  });

  it("traduz o id da opção de um select para o rótulo da opção", () => {
    const field = makeField({
      id: "f2",
      label: "Ambiente",
      type: "select",
      options: [
        { id: "o1", label: "Produção" },
        { id: "o2", label: "Homologação" },
      ],
    });

    const payload = plannedTaskToSharePayload(
      makeTask({ customValues: { f2: "o2" } }),
      [],
      [],
      [field]
    );

    expect(payload.customValues).toEqual({ Ambiente: "Homologação" });
  });

  it("descarta o valor de um campo que não está no catálogo", () => {
    const payload = plannedTaskToSharePayload(
      makeTask({ customValues: { f1: "ABC-123", apagado: "nada" } }),
      [],
      [],
      [makeField()]
    );

    expect(payload.customValues).toEqual({ Ticket: "ABC-123" });
  });

  it("descarta o select cuja opção não existe mais — o id cru não é rótulo de nada", () => {
    const field = makeField({
      id: "f2",
      label: "Ambiente",
      type: "select",
      options: [{ id: "o1", label: "Produção" }],
    });

    const payload = plannedTaskToSharePayload(
      makeTask({ customValues: { f2: "opcao-removida" } }),
      [],
      [],
      [field]
    );

    expect(payload.customValues).toEqual({});
  });

  it("descarta valor vazio, inclusive o checkbox desmarcado", () => {
    const checkbox = makeField({ id: "f3", label: "Urgente", type: "checkbox" });

    const payload = plannedTaskToSharePayload(
      makeTask({ customValues: { f1: "   ", f3: "" } }),
      [],
      [],
      [makeField(), checkbox]
    );

    expect(payload.customValues).toEqual({});
  });

  it("o campo arquivado continua viajando — o valor já gravado vale", () => {
    const payload = plannedTaskToSharePayload(
      makeTask({ customValues: { f1: "ABC-123" } }),
      [],
      [],
      [makeField({ archived: true })]
    );

    expect(payload.customValues).toEqual({ Ticket: "ABC-123" });
  });

  it("não leva agendamento, ações nem ids", () => {
    const payload = plannedTaskToSharePayload(
      makeTask({
        scheduleType: "recurring",
        recurringDays: [1, 3],
        actions: [{ type: "open_url", value: "https://exemplo.com" }],
      }),
      [],
      [],
      []
    );

    expect(Object.keys(payload).sort()).toEqual([
      "billable",
      "categoryName",
      "customValues",
      "endTime",
      "name",
      "projectName",
      "startTime",
    ]);
  });
});
