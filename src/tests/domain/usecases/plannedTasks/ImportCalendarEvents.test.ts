import { describe, it, expect, vi } from "vitest";
import { importCalendarEvents } from "@domain/usecases/plannedTasks/ImportCalendarEvents";
import type { IPlannedTaskRepository } from "@domain/repositories/IPlannedTaskRepository";
import type { CalendarEvent } from "@domain/integrations/ICalendarImporter";

function makeRepo(overrides: Partial<IPlannedTaskRepository> = {}): IPlannedTaskRepository {
  return {
    save: vi.fn(async () => undefined),
    update: vi.fn(async () => undefined),
    findById: vi.fn(async () => null),
    findForDate: vi.fn(async () => []),
    findForWeek: vi.fn(async () => []),
    complete: vi.fn(async () => undefined),
    uncomplete: vi.fn(async () => undefined),
    reorder: vi.fn(async () => undefined),
    delete: vi.fn(async () => undefined),
    ...overrides,
  };
}

function makeEvent(overrides: Partial<CalendarEvent> = {}): CalendarEvent {
  return {
    id: "evt-1",
    title: "Reunião",
    date: "2026-04-09",
    allDay: false,
    startTime: "09:00",
    endTime: "10:00",
    ...overrides,
  };
}

const NOW = "2026-04-09T10:00:00.000Z";

describe("importCalendarEvents", () => {
  it("retorna 0 e não salva nada com lista vazia", async () => {
    const repo = makeRepo();
    const count = await importCalendarEvents(repo, [], NOW);
    expect(count).toBe(0);
    expect(repo.save).not.toHaveBeenCalled();
  });

  it("cria tarefa specific_date preservando a data do evento", async () => {
    const repo = makeRepo();
    const count = await importCalendarEvents(repo, [
      {
        event: makeEvent({ date: "2026-04-09" }),
        projectId: null,
        categoryId: null,
        scheduleType: "specific_date",
        recurringDays: [],
      },
    ], NOW);

    expect(count).toBe(1);
    expect(repo.save).toHaveBeenCalledTimes(1);

    const saved = vi.mocked(repo.save).mock.calls[0][0];
    expect(saved.name).toBe("Reunião");
    expect(saved.scheduleType).toBe("specific_date");
    expect(saved.scheduleDate).toBe("2026-04-09");
    expect(saved.recurringDays).toBeNull();
  });

  it("cria tarefa recurring com os dias fornecidos", async () => {
    const repo = makeRepo();
    await importCalendarEvents(repo, [
      {
        event: makeEvent(),
        projectId: null,
        categoryId: null,
        scheduleType: "recurring",
        recurringDays: [1, 3, 5],
      },
    ], NOW);

    const saved = vi.mocked(repo.save).mock.calls[0][0];
    expect(saved.scheduleType).toBe("recurring");
    expect(saved.recurringDays).toEqual([1, 3, 5]);
    expect(saved.scheduleDate).toBeNull();
  });

  it("trata recurring sem dias como specific_date", async () => {
    const repo = makeRepo();
    await importCalendarEvents(repo, [
      {
        event: makeEvent({ date: "2026-04-10" }),
        projectId: null,
        categoryId: null,
        scheduleType: "recurring",
        recurringDays: [], // sem dias → cai em specific_date
      },
    ], NOW);

    const saved = vi.mocked(repo.save).mock.calls[0][0];
    expect(saved.scheduleType).toBe("specific_date");
    expect(saved.scheduleDate).toBe("2026-04-10");
  });

  it("propaga projectId e categoryId para a tarefa criada", async () => {
    const repo = makeRepo();
    await importCalendarEvents(repo, [
      {
        event: makeEvent(),
        projectId: "proj-abc",
        categoryId: "cat-xyz",
        scheduleType: "specific_date",
        recurringDays: [],
      },
    ], NOW);

    const saved = vi.mocked(repo.save).mock.calls[0][0];
    expect(saved.projectId).toBe("proj-abc");
    expect(saved.categoryId).toBe("cat-xyz");
  });

  it("cria uma tarefa por evento importado", async () => {
    const repo = makeRepo();
    const events = [
      makeEvent({ id: "e1", title: "Standup" }),
      makeEvent({ id: "e2", title: "Review" }),
      makeEvent({ id: "e3", title: "Planning" }),
    ];

    const count = await importCalendarEvents(
      repo,
      events.map((event) => ({
        event,
        projectId: null,
        categoryId: null,
        scheduleType: "specific_date",
        recurringDays: [],
      })),
      NOW,
    );

    expect(count).toBe(3);
    expect(repo.save).toHaveBeenCalledTimes(3);
  });

  it("usa o título do evento como nome da tarefa", async () => {
    const repo = makeRepo();
    await importCalendarEvents(repo, [
      {
        event: makeEvent({ title: "1:1 com gestor" }),
        projectId: null,
        categoryId: null,
        scheduleType: "specific_date",
        recurringDays: [],
      },
    ], NOW);

    const saved = vi.mocked(repo.save).mock.calls[0][0];
    expect(saved.name).toBe("1:1 com gestor");
  });

  it("cria tarefas com billable=false por padrão", async () => {
    const repo = makeRepo();
    await importCalendarEvents(repo, [
      {
        event: makeEvent(),
        projectId: null,
        categoryId: null,
        scheduleType: "specific_date",
        recurringDays: [],
      },
    ], NOW);

    const saved = vi.mocked(repo.save).mock.calls[0][0];
    expect(saved.billable).toBe(false);
  });
});
