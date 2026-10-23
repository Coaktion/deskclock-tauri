import { describe, it, expect, vi } from "vitest";
import type { CalendarEvent } from "@domain/integrations/ICalendarImporter";
import type { PlannedTask } from "@domain/entities/PlannedTask";
import type { CalendarImportSource } from "@presentation/integrations/importSources";
import { dispatchLocalApiRequest } from "@presentation/localApi/dispatch";
import { makeDeps, WS_ATIVO } from "../fakeDeps";

function event(overrides: Partial<CalendarEvent>): CalendarEvent {
  return {
    id: "e1",
    title: "Daily",
    date: "2026-09-15",
    startTime: "09:30",
    endTime: "10:00",
    allDay: false,
    ...overrides,
  };
}

const EVENTS = [
  event({
    id: "d1",
    recurringEventId: "s1",
    suggestedRecurringDays: [1, 2],
    description: "Projeto: Cliente\nCategoria: Reuniões",
  }),
  event({ id: "d2", recurringEventId: "s2", suggestedRecurringDays: [3] }),
  event({ id: "r1", title: "Revisão", startTime: "14:00", endTime: "15:00" }),
  event({ id: "x1", title: "Almoço", startTime: "12:00", endTime: "13:00" }),
];

function setup(source: Partial<CalendarImportSource> = {}, existing: Partial<PlannedTask>[] = []) {
  const deps = makeDeps();
  const importer = { getEvents: vi.fn(async () => EVENTS) };
  deps.plannedTaskRepo.findForWeek.mockResolvedValue(existing as never);
  deps.imports.calendar.mockReturnValue({
    notConfiguredMessage: null,
    importer,
    workspaceId: WS_ATIVO,
    showWeekend: false,
    ignoreRules: [{ operator: "equals", value: "almoço" }],
    ...source,
  });
  return { deps, importer };
}

describe("calendar.importPreview", () => {
  it("lista os eventos da semana com a sugestão e os sinais da tela", async () => {
    const { deps, importer } = setup({}, [{ name: "revisão" }]);
    const res = await dispatchLocalApiRequest(deps, "calendar.importPreview", {});

    expect(res.status).toBe(200);
    // Sem período: a semana corrente (segunda a domingo, `weekStartsOn` 1).
    expect(deps.plannedTaskRepo.findForWeek).toHaveBeenCalledWith(
      "2026-09-14",
      "2026-09-20",
      WS_ATIVO
    );
    expect(importer.getEvents).toHaveBeenCalled();
    const body = res.body as { from: string; to: string; events: Record<string, unknown>[] };
    expect([body.from, body.to]).toEqual(["2026-09-14", "2026-09-20"]);
    expect(body.events[0]).toMatchObject({
      id: "d1",
      recurring: true,
      projectId: "proj-ativo",
      categoryId: "cat-ativo",
      scheduleType: "recurring",
      recurringDays: [1, 2],
      preselected: true,
    });
    expect(body.events.find((e) => e.id === "r1")).toMatchObject({
      alreadyExists: true,
      preselected: false,
    });
    expect(body.events.find((e) => e.id === "x1")).toMatchObject({
      ignored: true,
      preselected: false,
    });
  });

  it("só from vale para o próprio dia; formato ruim é 400", async () => {
    const { deps } = setup();
    const res = await dispatchLocalApiRequest(deps, "calendar.importPreview", {
      from: "2026-09-16",
    });
    expect(res.body).toMatchObject({ from: "2026-09-16", to: "2026-09-16" });
    expect(
      (await dispatchLocalApiRequest(deps, "calendar.importPreview", { from: "16/09" })).status
    ).toBe(400);
  });

  it("Google não conectado é 409", async () => {
    const { deps } = setup({ notConfiguredMessage: "Google Agenda não conectado." });
    expect(await dispatchLocalApiRequest(deps, "calendar.importPreview", {})).toEqual({
      status: 409,
      body: { error: "Google Agenda não conectado." },
    });
  });
});

describe("calendar.import", () => {
  it("colapsa a série, aplica o que a linha mudou, avisa e rastreia", async () => {
    const { deps } = setup();
    const res = await dispatchLocalApiRequest(deps, "calendar.import", {
      body: {
        events: [
          { id: "d1" },
          { id: "d2" },
          { id: "r1", projectName: "Cliente", scheduleType: "specific_date" },
        ],
        trackMeetings: true,
        addOpenUrlAction: false,
      },
    });

    expect(res.status).toBe(200);
    const body = res.body as {
      created: { eventId: string; plannedTask: Record<string, unknown> }[];
      mergedEventIds: string[];
      trackedMeetings: number;
    };
    expect(body.mergedEventIds).toEqual(["d2"]);
    expect(body.created.map((c) => c.eventId)).toEqual(["d1", "r1"]);
    expect(body.created[0].plannedTask).toMatchObject({
      workspaceId: WS_ATIVO,
      scheduleType: "recurring",
      recurringDays: [1, 2, 3],
      projectName: "Cliente",
      categoryName: "Reuniões",
      actions: [],
    });
    // Trocar o projeto zera a categoria, como a tela.
    expect(body.created[1].plannedTask).toMatchObject({
      projectId: "proj-ativo",
      categoryId: null,
      scheduleType: "specific_date",
      scheduleDate: "2026-09-15",
    });
    expect(deps.plannedTaskRepo.save).toHaveBeenCalledTimes(2);
    expect(deps.notifyPlannedTasksChanged).toHaveBeenCalled();
    expect(body.trackedMeetings).toBe(2);
    expect(deps.trackedMeetingRepo.upsert).toHaveBeenCalledTimes(2);
  });

  it("padrão: ação de abrir o evento ligada, sem rastrear", async () => {
    const { deps } = setup();
    EVENTS[2].htmlLink = "https://calendar.google.com/e/r1";
    const res = await dispatchLocalApiRequest(deps, "calendar.import", {
      body: { events: [{ id: "r1" }] },
    });
    const created = (res.body as { created: { plannedTask: { actions: unknown[] } }[] }).created;
    expect(created[0].plannedTask.actions).toHaveLength(1);
    expect(deps.trackedMeetingRepo.upsert).not.toHaveBeenCalled();
    delete EVENTS[2].htmlLink;
  });

  it("vazio ou fora do formato 400; fora do período 404; projeto desconhecido 409", async () => {
    const { deps } = setup();
    const call = (body: unknown) => dispatchLocalApiRequest(deps, "calendar.import", { body });
    expect((await call({ events: [] })).status).toBe(400);
    expect((await call({ events: ["d1"] })).status).toBe(400);
    expect((await call({ events: [{ id: "d1", recurringDays: [7] }] })).status).toBe(400);
    expect((await call({ events: [{ id: "d1", scheduleType: "period" }] })).status).toBe(400);
    expect((await call({ events: [{ id: "nao-existe" }] })).status).toBe(404);
    expect((await call({ events: [{ id: "d1", projectName: "Outro" }] })).status).toBe(409);
    expect(deps.plannedTaskRepo.save).not.toHaveBeenCalled();
  });
});
