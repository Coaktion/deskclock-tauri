import { describe, it, expect, vi } from "vitest";
import type { Category } from "@domain/entities/Category";
import type { PlannedTask } from "@domain/entities/PlannedTask";
import type { Project } from "@domain/entities/Project";
import type { CalendarEvent } from "@domain/integrations/ICalendarImporter";
import type { IPlannedTaskRepository } from "@domain/repositories/IPlannedTaskRepository";
import {
  calendarEventDefaults,
  loadCalendarImportCandidates,
} from "@domain/usecases/calendar/loadCalendarImportCandidates";

const PROJECTS: Project[] = [{ id: "p1", workspaceId: "ws", name: "Cliente", colorIndex: 0 }];
const CATEGORIES: Category[] = [
  { id: "c1", workspaceId: "ws", name: "Reuniões", defaultBillable: false },
];

function event(overrides: Partial<CalendarEvent>): CalendarEvent {
  return { id: "e1", title: "Daily", date: "2026-09-14", allDay: false, ...overrides };
}

function setup(events: CalendarEvent[], existing: Partial<PlannedTask>[] = []) {
  const importer = { getEvents: vi.fn(async () => events) };
  const repo = {
    findForWeek: vi.fn(async () => existing as PlannedTask[]),
  } as unknown as IPlannedTaskRepository & { findForWeek: ReturnType<typeof vi.fn> };
  return { importer, repo };
}

const PARAMS = {
  fromDay: "2026-09-14",
  toDay: "2026-09-20",
  workspaceId: "ws",
  showWeekend: false,
  ignoreRules: [],
  projects: PROJECTS,
  categories: CATEGORIES,
};

describe("calendarEventDefaults", () => {
  it("casa projeto e categoria pelos metadados da descrição e sugere recorrente na série", () => {
    const defaults = calendarEventDefaults(
      event({
        description: "Projeto: cliente\nCategoria: reuniões",
        recurringEventId: "serie",
        suggestedRecurringDays: [1, 3, 6],
      }),
      PROJECTS,
      CATEGORIES,
      false
    );
    expect(defaults).toEqual({
      projectId: "p1",
      projectName: "Cliente",
      categoryId: "c1",
      categoryName: "Reuniões",
      scheduleType: "recurring",
      // Sábado sai com o fim de semana desligado.
      recurringDays: [1, 3],
    });
  });

  it("evento avulso sem metadados vira data específica sem projeto", () => {
    expect(calendarEventDefaults(event({}), PROJECTS, CATEGORIES, true)).toMatchObject({
      projectId: null,
      categoryId: null,
      scheduleType: "specific_date",
      recurringDays: [],
    });
  });
});

describe("loadCalendarImportCandidates", () => {
  it("busca o período em dias no workspace de destino e marca já existe e ignorado", async () => {
    const { importer, repo } = setup(
      [
        event({ id: "a", title: "Daily" }),
        event({ id: "b", title: "  daily " }),
        event({ id: "c", title: "Almoço" }),
        event({ id: "d", title: "Revisão" }),
      ],
      [{ name: "DAILY" }]
    );

    const result = await loadCalendarImportCandidates(importer, repo, {
      ...PARAMS,
      ignoreRules: [{ operator: "equals", value: "almoço" }],
    });

    expect(repo.findForWeek).toHaveBeenCalledWith("2026-09-14", "2026-09-20", "ws");
    expect(importer.getEvents).toHaveBeenCalledWith(
      new Date("2026-09-14T00:00:00").toISOString(),
      new Date("2026-09-20T23:59:59").toISOString()
    );
    expect(result.map((c) => [c.event.id, c.alreadyExists, c.ignored, c.preselected])).toEqual([
      ["a", true, false, false],
      ["b", true, false, false],
      ["c", false, true, false],
      ["d", false, false, true],
    ]);
  });

  it("descarta o fim de semana na origem quando ele está desligado", async () => {
    const events = [
      event({ id: "seg", date: "2026-09-14" }),
      event({ id: "sab", date: "2026-09-19" }),
    ];
    let { importer, repo } = setup(events);
    let result = await loadCalendarImportCandidates(importer, repo, PARAMS);
    expect(result.map((c) => c.event.id)).toEqual(["seg"]);

    ({ importer, repo } = setup(events));
    result = await loadCalendarImportCandidates(importer, repo, { ...PARAMS, showWeekend: true });
    expect(result.map((c) => c.event.id)).toEqual(["seg", "sab"]);
  });
});
