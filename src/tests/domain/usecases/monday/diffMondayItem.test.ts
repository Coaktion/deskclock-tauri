import { describe, it, expect } from "vitest";
import type { Category } from "@domain/entities/Category";
import type { CustomField } from "@domain/entities/CustomField";
import type { PlannedTask } from "@domain/entities/PlannedTask";
import type { MondayItemSnapshot } from "@domain/integrations/TrackedMondayItem";
import {
  applyMondayChanges,
  diffSnapshot,
  hasChanges,
  snapshotOf,
} from "@domain/usecases/monday/diffMondayItem";
import type { MondayImportRow } from "@domain/usecases/monday/mondayImportRows";
import type { MondayItem } from "@shared/types/monday";

const CATEGORIES: Category[] = [
  { id: "c1", workspaceId: "ws-1", name: "Development", defaultBillable: true },
  { id: "c2", workspaceId: "ws-1", name: "Reuniões", defaultBillable: false },
];

const STAGE_FIELD: CustomField = {
  id: "f-stage",
  label: "Project Stage",
  type: "select",
  options: [
    { id: "opt-dev", label: "Development" },
    { id: "opt-uat", label: "UAT" },
  ],
  sortOrder: 0,
  archived: false,
  createdAt: "2026-07-01T00:00:00Z",
};

const CTX = { categories: CATEGORIES, stageField: STAGE_FIELD, fallbackDayISO: "2026-08-03" };

function row(overrides: Partial<MondayImportRow> = {}): MondayImportRow {
  const item: MondayItem = {
    id: "1",
    name: "Desenvolvimento",
    url: "https://monday.com/i/1",
    boardId: "b1",
    groupId: "g",
    groupTitle: "Timeline",
    createdAt: "2026-08-01T10:00:00Z",
    columnValues: [],
  };
  return {
    item,
    project: { id: "p1", workspaceId: "ws-1", name: "Cliente A" },
    period: { startDayISO: "2026-08-03", endDayISO: "2026-08-03" },
    activityTypeLabel: "Development",
    projectStageLabel: "UAT",
    ...overrides,
  };
}

function snapshot(overrides: Partial<MondayItemSnapshot> = {}): MondayItemSnapshot {
  return { ...snapshotOf(row()), ...overrides };
}

function planned(overrides: Partial<PlannedTask> = {}): PlannedTask {
  return {
    id: "pt-1",
    workspaceId: "ws-1",
    name: "Desenvolvimento",
    projectId: "p1",
    categoryId: "c1",
    billable: true,
    scheduleType: "specific_date",
    scheduleDate: "2026-08-03",
    recurringDays: null,
    periodStart: null,
    periodEnd: null,
    completedDates: [],
    actions: [],
    sortOrder: 0,
    createdAt: "2026-08-01T10:00:00Z",
    customValues: { "f-stage": "opt-uat" },
    ...overrides,
  };
}

describe("diffSnapshot", () => {
  it("item intocado não gera mudança nenhuma", () => {
    expect(hasChanges(diffSnapshot(snapshot(), row()))).toBe(false);
  });

  it("acusa só o campo que mudou no Monday", () => {
    const changes = diffSnapshot(snapshot(), row({ item: { ...row().item, name: "Novo nome" } }));

    expect(changes).toEqual({ name: "Novo nome" });
  });

  it("remarcação da Timeline conta como mudança de período", () => {
    const changes = diffSnapshot(
      snapshot(),
      row({ period: { startDayISO: "2026-08-05", endDayISO: "2026-08-09" } })
    );

    expect(changes.period).toEqual({ startDayISO: "2026-08-05", endDayISO: "2026-08-09" });
  });

  it("Timeline apagada no board também é mudança", () => {
    expect(diffSnapshot(snapshot(), row({ period: null })).period).toBeNull();
  });
});

describe("applyMondayChanges", () => {
  it("reescreve só o campo mudado — a edição local sobrevive", () => {
    // O usuário renomeou a planejada aqui; o Monday mexeu na etapa.
    const local = planned({ name: "Meu nome", categoryId: "c2", billable: false });
    const next = applyMondayChanges(local, { projectStageLabel: "Development" }, CTX);

    expect(next.name).toBe("Meu nome");
    expect(next.categoryId).toBe("c2");
    expect(next.billable).toBe(false);
    expect(next.customValues).toEqual({ "f-stage": "opt-dev" });
  });

  it("período de vários dias vira agendamento de período", () => {
    const next = applyMondayChanges(
      planned(),
      { period: { startDayISO: "2026-08-05", endDayISO: "2026-08-09" } },
      CTX
    );

    expect(next).toMatchObject({
      scheduleType: "period",
      scheduleDate: null,
      periodStart: "2026-08-05",
      periodEnd: "2026-08-09",
    });
  });

  it("item que perdeu a Timeline volta para o dia corrente", () => {
    const next = applyMondayChanges(planned({ scheduleDate: "2026-09-01" }), { period: null }, CTX);

    expect(next).toMatchObject({ scheduleType: "specific_date", scheduleDate: "2026-08-03" });
  });

  it("novo Activity Type arrasta a categoria e o billable dela (§6.2)", () => {
    const next = applyMondayChanges(planned(), { activityTypeLabel: "Reuniões" }, CTX);

    expect(next.categoryId).toBe("c2");
    expect(next.billable).toBe(false);
  });

  it("Activity Type sem categoria correspondente limpa o campo", () => {
    // Manter a categoria anterior afirmaria algo que o board deixou de dizer.
    const next = applyMondayChanges(planned(), { activityTypeLabel: "Inexistente" }, CTX);

    expect(next.categoryId).toBeNull();
    expect(next.billable).toBe(false);
  });

  it("etapa removida no board limpa o valor do campo personalizado", () => {
    const next = applyMondayChanges(planned(), { projectStageLabel: "" }, CTX);

    expect(next.customValues).toEqual({});
  });

  it("sem campo de etapa configurado, não mexe nos campos personalizados", () => {
    const next = applyMondayChanges(
      planned(),
      { projectStageLabel: "Development" },
      {
        ...CTX,
        stageField: null,
      }
    );

    expect(next.customValues).toEqual({ "f-stage": "opt-uat" });
  });
});
