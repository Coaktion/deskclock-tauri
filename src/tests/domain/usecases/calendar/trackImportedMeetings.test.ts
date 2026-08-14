import { describe, it, expect, vi } from "vitest";
import { trackImportedMeetings } from "@domain/usecases/calendar/trackImportedMeetings";
import { composeLocalISO, composeMeetingEndISO } from "@domain/usecases/calendar/meetingTime";
import type { CalendarEvent } from "@domain/integrations/ICalendarImporter";
import type { TrackedMeeting } from "@domain/integrations/TrackedMeeting";

const TODAY = "2026-07-01";

function makeEvent(overrides: Partial<CalendarEvent> = {}): CalendarEvent {
  return {
    id: "evt1",
    title: "Daily",
    date: TODAY,
    startTime: "10:00",
    endTime: "10:30",
    allDay: false,
    ...overrides,
  };
}

function makeMeeting(overrides: Partial<TrackedMeeting> = {}): TrackedMeeting {
  return {
    calendarEventId: "evt1",
    date: TODAY,
    title: "Daily",
    startISO: composeLocalISO(TODAY, "10:00"),
    endISO: composeMeetingEndISO(TODAY, "10:00", "10:30"),
    startedTaskId: null,
    plannedTaskId: null,
    startPromptedAt: null,
    startDismissed: false,
    endPromptCount: 0,
    lastEndPromptAt: null,
    ended: false,
    ...overrides,
  };
}

function makeRepo(existing: TrackedMeeting[] = []) {
  return {
    listForDate: vi.fn(async (date: string) => existing.filter((m) => m.date === date)),
    upsert: vi.fn(async () => {}),
    setPlannedTaskId: vi.fn(async () => {}),
    setStartedTaskId: vi.fn(async () => {}),
    remove: vi.fn(async () => {}),
    pruneBefore: vi.fn(async () => {}),
  };
}

describe("trackImportedMeetings", () => {
  it("rastreia o evento com horário já vinculado à planejada criada", async () => {
    const repo = makeRepo();
    const event = makeEvent();

    const result = await trackImportedMeetings(repo, [{ event, plannedTaskId: "pt-1" }], TODAY);

    expect(result).toEqual({ tracked: 1, errors: [] });
    expect(repo.upsert).toHaveBeenCalledTimes(1);
    expect(repo.upsert).toHaveBeenCalledWith({
      calendarEventId: "evt1",
      date: TODAY,
      title: "Daily",
      startISO: composeLocalISO(TODAY, "10:00"),
      endISO: composeMeetingEndISO(TODAY, "10:00", "10:30"),
      startedTaskId: null,
      plannedTaskId: "pt-1",
      startPromptedAt: null,
      startDismissed: false,
      endPromptCount: 0,
      lastEndPromptAt: null,
      ended: false,
    });
  });

  it("aceita evento sem término — o fim fica indeterminado", async () => {
    const repo = makeRepo();
    const event = makeEvent({ endTime: undefined });

    await trackImportedMeetings(repo, [{ event, plannedTaskId: "pt-1" }], TODAY);

    expect(repo.upsert).toHaveBeenCalledWith(expect.objectContaining({ endISO: null }));
  });

  it("ignora evento de dia todo e evento sem hora de início", async () => {
    const repo = makeRepo();
    const links = [
      { event: makeEvent({ id: "a", allDay: true, startTime: undefined }), plannedTaskId: "pt-a" },
      { event: makeEvent({ id: "b", startTime: undefined }), plannedTaskId: "pt-b" },
    ];

    const result = await trackImportedMeetings(repo, links, TODAY);

    expect(result.tracked).toBe(0);
    expect(repo.upsert).not.toHaveBeenCalled();
  });

  it("ignora evento de dia passado — a linha nasceria já podável", async () => {
    const repo = makeRepo();
    const event = makeEvent({ date: "2026-06-30" });

    const result = await trackImportedMeetings(repo, [{ event, plannedTaskId: "pt-1" }], TODAY);

    expect(result.tracked).toBe(0);
    expect(repo.upsert).not.toHaveBeenCalled();
  });

  it("rastreia evento de dia futuro — a poda só apaga o que já passou", async () => {
    const repo = makeRepo();
    const event = makeEvent({ date: "2026-07-03" });

    const result = await trackImportedMeetings(repo, [{ event, plannedTaskId: "pt-1" }], TODAY);

    expect(result.tracked).toBe(1);
    expect(repo.upsert).toHaveBeenCalledWith(expect.objectContaining({ date: "2026-07-03" }));
  });

  it("preserva a reunião já rastreada, em vez de reescrever a linha", async () => {
    const repo = makeRepo([
      makeMeeting({ startedTaskId: "task-9", startDismissed: true, plannedTaskId: "pt-antiga" }),
    ]);
    const event = makeEvent();

    const result = await trackImportedMeetings(repo, [{ event, plannedTaskId: "pt-nova" }], TODAY);

    expect(result.tracked).toBe(0);
    expect(repo.upsert).not.toHaveBeenCalled();
    expect(repo.setPlannedTaskId).not.toHaveBeenCalled();
  });

  it("lê o estado uma vez por data, não uma vez por evento", async () => {
    const repo = makeRepo();
    const links = [
      { event: makeEvent({ id: "a" }), plannedTaskId: "pt-a" },
      { event: makeEvent({ id: "b", startTime: "11:00" }), plannedTaskId: "pt-b" },
      { event: makeEvent({ id: "c", date: "2026-07-02" }), plannedTaskId: "pt-c" },
    ];

    await trackImportedMeetings(repo, links, TODAY);

    expect(repo.listForDate).toHaveBeenCalledTimes(2);
    expect(repo.upsert).toHaveBeenCalledTimes(3);
  });

  it("uma reunião que falha não impede as seguintes", async () => {
    const repo = makeRepo();
    repo.upsert.mockRejectedValueOnce(new Error("banco ocupado"));
    const links = [
      { event: makeEvent({ id: "a" }), plannedTaskId: "pt-a" },
      { event: makeEvent({ id: "b", startTime: "11:00" }), plannedTaskId: "pt-b" },
    ];

    const result = await trackImportedMeetings(repo, links, TODAY);

    expect(result.tracked).toBe(1);
    expect(result.errors).toEqual(["banco ocupado"]);
  });

  it("não rastreia a data cujo estado não pôde ser lido", async () => {
    const repo = makeRepo();
    repo.listForDate.mockRejectedValueOnce(new Error("leitura falhou"));
    const links = [
      { event: makeEvent({ id: "a" }), plannedTaskId: "pt-a" },
      { event: makeEvent({ id: "c", date: "2026-07-02" }), plannedTaskId: "pt-c" },
    ];

    const result = await trackImportedMeetings(repo, links, TODAY);

    expect(result.tracked).toBe(1);
    expect(result.errors).toEqual(["leitura falhou"]);
    expect(repo.upsert).toHaveBeenCalledTimes(1);
    expect(repo.upsert).toHaveBeenCalledWith(expect.objectContaining({ calendarEventId: "c" }));
  });

  it("não faz leitura nenhuma quando não há evento rastreável", async () => {
    const repo = makeRepo();

    const result = await trackImportedMeetings(repo, [], TODAY);

    expect(result).toEqual({ tracked: 0, errors: [] });
    expect(repo.listForDate).not.toHaveBeenCalled();
  });
});
