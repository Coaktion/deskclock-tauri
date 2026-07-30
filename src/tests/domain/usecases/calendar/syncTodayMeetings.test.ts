import { describe, it, expect, vi, beforeEach } from "vitest";
import { syncTodayMeetings } from "@domain/usecases/calendar/syncTodayMeetings";
import { composeLocalISO, composeMeetingEndISO } from "@domain/usecases/calendar/meetingTime";
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

function makeMeeting(overrides: Partial<TrackedMeeting> = {}): TrackedMeeting {
  return {
    calendarEventId: "evt1",
    date: "2026-07-01",
    title: "Daily",
    startISO: composeLocalISO("2026-07-01", "10:00"),
    endISO: composeMeetingEndISO("2026-07-01", "10:00", "10:30"),
    startedTaskId: null,
    startPromptedAt: null,
    startDismissed: false,
    endPromptCount: 0,
    lastEndPromptAt: null,
    ended: false,
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
    remove: vi.fn(async () => {}),
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
  workspaceId: "ws-1",
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

  it("não re-rastreia eventos já conhecidos e inalterados (preserva estado)", async () => {
    // ISOs derivados de composeLocalISO para não depender do fuso da máquina.
    const existing: TrackedMeeting[] = [
      makeMeeting({
        startISO: composeLocalISO("2026-07-01", "10:00"),
        endISO: composeMeetingEndISO("2026-07-01", "10:00", "10:30"),
        startedTaskId: "task1",
        startPromptedAt: composeLocalISO("2026-07-01", "10:00"),
      }),
    ];
    const deps = makeDeps([makeEvent()], existing);
    const result = await syncTodayMeetings(deps, RANGE);
    expect(result).toEqual({ tracked: 0, plannedCreated: 0 });
    expect(deps.trackedRepo.upsert).not.toHaveBeenCalled();
    expect(deps.trackedRepo.remove).not.toHaveBeenCalled();
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

  describe("reconciliação de reuniões remarcadas/canceladas", () => {
    it("remove rastreamento de reunião que sumiu da agenda de hoje (cancelada/movida) e não foi iniciada", async () => {
      const existing = [makeMeeting({ calendarEventId: "gone" })];
      // A agenda de hoje não traz mais o evento "gone".
      const deps = makeDeps([makeEvent({ id: "other", title: "Outra" })], existing);
      await syncTodayMeetings(deps, RANGE);
      expect(deps.trackedRepo.remove).toHaveBeenCalledWith("gone");
    });

    it("NÃO remove reunião sumida que já foi iniciada como tarefa (prompt de fim cuida dela)", async () => {
      const existing = [makeMeeting({ calendarEventId: "gone", startedTaskId: "task1" })];
      const deps = makeDeps([], existing);
      await syncTodayMeetings(deps, RANGE);
      expect(deps.trackedRepo.remove).not.toHaveBeenCalled();
    });

    it("remarcada no mesmo dia: atualiza horário e reabre o prompt (zera prompted/dismissed)", async () => {
      const existing = [
        makeMeeting({
          startISO: composeLocalISO("2026-07-01", "10:00"),
          endISO: composeMeetingEndISO("2026-07-01", "10:00", "10:30"),
          startPromptedAt: composeLocalISO("2026-07-01", "09:59"),
          startDismissed: true,
        }),
      ];
      // Mesmo evento (evt1), agora às 15:00.
      const deps = makeDeps([makeEvent({ startTime: "15:00", endTime: "15:30" })], existing);
      await syncTodayMeetings(deps, RANGE);
      expect(deps.trackedRepo.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          calendarEventId: "evt1",
          startISO: composeLocalISO("2026-07-01", "15:00"),
          endISO: composeMeetingEndISO("2026-07-01", "15:00", "15:30"),
          startPromptedAt: null,
          startDismissed: false,
        })
      );
      expect(deps.trackedRepo.remove).not.toHaveBeenCalled();
    });

    it("remarcada mas já iniciada: só acompanha o novo término, preserva startedTaskId e prompt", async () => {
      const existing = [
        makeMeeting({
          startedTaskId: "task1",
          startPromptedAt: composeLocalISO("2026-07-01", "10:00"),
          startISO: composeLocalISO("2026-07-01", "10:00"),
          endISO: composeMeetingEndISO("2026-07-01", "10:00", "10:30"),
        }),
      ];
      const deps = makeDeps([makeEvent({ endTime: "11:00" })], existing);
      await syncTodayMeetings(deps, RANGE);
      expect(deps.trackedRepo.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          startedTaskId: "task1",
          endISO: composeMeetingEndISO("2026-07-01", "10:00", "11:00"),
          startPromptedAt: composeLocalISO("2026-07-01", "10:00"),
        })
      );
    });
  });
});
