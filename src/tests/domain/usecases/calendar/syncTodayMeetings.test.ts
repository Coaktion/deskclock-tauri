import { describe, it, expect, vi, beforeEach } from "vitest";
import { syncTodayMeetings } from "@domain/usecases/calendar/syncTodayMeetings";
import type { CalendarEvent } from "@domain/integrations/ICalendarImporter";
import type { TrackedMeeting } from "@domain/integrations/TrackedMeeting";

function makeEvent(overrides: Partial<CalendarEvent> = {}): CalendarEvent {
  return {
    id: "evt1",
    title: "Daily",
    date: "2026-07-01",
    startTime: "10:00",
    endTime: "10:30",
    allDay: false,
    ...overrides,
  };
}

function makeDeps(
  events: CalendarEvent[],
  existing: TrackedMeeting[] = [],
  planned: { name: string }[] = [],
  projects: { id: string; name: string }[] = [],
  categories: { id: string; name: string }[] = []
) {
  const importer = { getEvents: vi.fn(async () => events) };
  const trackedRepo = {
    listForDate: vi.fn(async () => existing),
    upsert: vi.fn(async () => {}),
    pruneBefore: vi.fn(async () => {}),
  };
  const plannedRepo = {
    findForDate: vi.fn(async () => planned),
    save: vi.fn(async () => {}),
    update: vi.fn(async () => {}),
    findById: vi.fn(),
    findForWeek: vi.fn(),
    complete: vi.fn(),
    uncomplete: vi.fn(),
    reorder: vi.fn(),
    delete: vi.fn(),
  };
  const projectRepo = { findAll: vi.fn(async () => projects) };
  const categoryRepo = { findAll: vi.fn(async () => categories) };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return { importer, trackedRepo, plannedRepo, projectRepo, categoryRepo } as any;
}

const RANGE = {
  todayISO: "2026-07-01",
  fromISO: "2026-07-01T00:00:00.000Z",
  toISO: "2026-07-01T23:59:59.999Z",
  nowISO: "2026-07-01T08:00:00.000Z",
};

describe("syncTodayMeetings", () => {
  beforeEach(() => vi.clearAllMocks());

  it("rastreia eventos novos com horário e cria PlannedTask", async () => {
    const deps = makeDeps([makeEvent()]);
    const result = await syncTodayMeetings(deps, RANGE);

    expect(result).toEqual({ tracked: 1, plannedCreated: 1 });
    expect(deps.trackedRepo.upsert).toHaveBeenCalledTimes(1);
    expect(deps.trackedRepo.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ calendarEventId: "evt1", title: "Daily", startedTaskId: null })
    );
    expect(deps.plannedRepo.save).toHaveBeenCalledTimes(1);
    expect(deps.trackedRepo.pruneBefore).toHaveBeenCalledWith("2026-07-01");
  });

  it("ignora eventos de dia inteiro e sem horário de início", async () => {
    const deps = makeDeps([
      makeEvent({ id: "a", allDay: true }),
      makeEvent({ id: "b", startTime: undefined }),
    ]);
    const result = await syncTodayMeetings(deps, RANGE);
    expect(result).toEqual({ tracked: 0, plannedCreated: 0 });
    expect(deps.trackedRepo.upsert).not.toHaveBeenCalled();
  });

  it("não re-rastreia eventos já conhecidos (preserva estado)", async () => {
    const existing: TrackedMeeting[] = [
      {
        calendarEventId: "evt1",
        date: "2026-07-01",
        title: "Daily",
        startISO: "2026-07-01T13:00:00.000Z",
        endISO: "2026-07-01T13:30:00.000Z",
        startedTaskId: "task1",
        startPromptedAt: "2026-07-01T13:00:00.000Z",
        startDismissed: false,
        endPromptCount: 0,
        lastEndPromptAt: null,
        ended: false,
      },
    ];
    const deps = makeDeps([makeEvent()], existing);
    const result = await syncTodayMeetings(deps, RANGE);
    expect(result).toEqual({ tracked: 0, plannedCreated: 0 });
    expect(deps.trackedRepo.upsert).not.toHaveBeenCalled();
  });

  it("não cria PlannedTask duplicada quando já existe planejada com o mesmo nome", async () => {
    const deps = makeDeps([makeEvent()], [], [{ name: "daily" }]);
    const result = await syncTodayMeetings(deps, RANGE);
    expect(result).toEqual({ tracked: 1, plannedCreated: 0 }); // rastreia, mas não recria a planejada
    expect(deps.plannedRepo.save).not.toHaveBeenCalled();
  });

  it("pré-preenche projeto e categoria a partir da descrição do evento", async () => {
    const deps = makeDeps(
      [makeEvent({ description: "Projeto: Alpha\nCategoria: Reuniões" })],
      [],
      [],
      [{ id: "p1", name: "Alpha" }],
      [{ id: "c1", name: "Reuniões" }]
    );
    await syncTodayMeetings(deps, RANGE);
    expect(deps.plannedRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({ projectId: "p1", categoryId: "c1" })
    );
  });
});
