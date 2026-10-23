import { describe, it, expect, vi } from "vitest";
import type { PlannedTask } from "@domain/entities/PlannedTask";
import type { CalendarEvent } from "@domain/integrations/ICalendarImporter";
import type { ITrackedMeetingRepository } from "@domain/integrations/ITrackedMeetingRepository";
import type { IPlannedTaskRepository } from "@domain/repositories/IPlannedTaskRepository";
import {
  importCalendarSelection,
  planCalendarImport,
  type CalendarImportSelection,
} from "@domain/usecases/calendar/importCalendarSelection";
import { localISO } from "../../../helpers/localTime";

function selection(
  id: string,
  overrides: Partial<CalendarEvent> = {},
  rest: Partial<CalendarImportSelection> = {}
): CalendarImportSelection {
  return {
    event: {
      id,
      title: "Daily",
      date: "2026-09-21",
      startTime: "09:30",
      endTime: "10:00",
      allDay: false,
      ...overrides,
    },
    projectId: null,
    categoryId: null,
    scheduleType: "recurring",
    recurringDays: [1],
    ...rest,
  };
}

describe("planCalendarImport", () => {
  it("colapsa a série partida e une os dias no sobrevivente", () => {
    const plan = planCalendarImport([
      selection("a", {}, { recurringDays: [1, 3] }),
      selection("b", {}, { recurringDays: [2, 3] }),
      selection("c", { title: "Outra" }, { scheduleType: "specific_date", recurringDays: [] }),
    ]);
    expect([...plan.dedupedIds]).toEqual(["b"]);
    expect(plan.inputs.map((i) => [i.event.id, i.recurringDays])).toEqual([
      ["a", [1, 3, 2]],
      ["c", []],
    ]);
  });
});

function repos() {
  const plannedRepo = {
    save: vi.fn(async (_t: PlannedTask) => {}),
  } as unknown as IPlannedTaskRepository & { save: ReturnType<typeof vi.fn> };
  const trackedRepo = {
    listForDate: vi.fn(async () => []),
    upsert: vi.fn(async () => {}),
  } as unknown as ITrackedMeetingRepository & {
    listForDate: ReturnType<typeof vi.fn>;
    upsert: ReturnType<typeof vi.fn>;
  };
  return { plannedRepo, trackedRepo };
}

const PARAMS = {
  workspaceId: "ws",
  nowISO: localISO(2026, 9, 20, 10),
  todayISO: "2026-09-20",
  addOpenUrlAction: false,
};

describe("importCalendarSelection", () => {
  it("grava no workspace pedido e não rastreia com a chave desligada", async () => {
    const { plannedRepo, trackedRepo } = repos();
    const { inputs } = planCalendarImport([selection("a")]);
    const result = await importCalendarSelection({ plannedRepo, trackedRepo }, inputs, {
      ...PARAMS,
      trackMeetings: false,
    });
    expect(result.created).toHaveLength(1);
    expect(result.created[0]).toMatchObject({ workspaceId: "ws", name: "Daily" });
    expect(result.tracked).toBe(0);
    expect(trackedRepo.upsert).not.toHaveBeenCalled();
  });

  it("rastreia emparelhando evento e planejada", async () => {
    const { plannedRepo, trackedRepo } = repos();
    const { inputs } = planCalendarImport([selection("a")]);
    const result = await importCalendarSelection({ plannedRepo, trackedRepo }, inputs, {
      ...PARAMS,
      trackMeetings: true,
    });
    expect(result.tracked).toBe(1);
    expect(trackedRepo.upsert.mock.calls[0][0]).toMatchObject({
      calendarEventId: "a",
      plannedTaskId: result.created[0].id,
    });
  });

  it("falha do rastreio volta em trackErrors e não desfaz o import", async () => {
    const { plannedRepo, trackedRepo } = repos();
    trackedRepo.listForDate.mockRejectedValue(new Error("banco fora"));
    const { inputs } = planCalendarImport([selection("a")]);
    const result = await importCalendarSelection({ plannedRepo, trackedRepo }, inputs, {
      ...PARAMS,
      trackMeetings: true,
    });
    expect(result.created).toHaveLength(1);
    expect(result.tracked).toBe(0);
    expect(result.trackErrors).toEqual(["banco fora"]);
  });
});
