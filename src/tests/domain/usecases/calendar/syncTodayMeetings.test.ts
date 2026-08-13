import { describe, it, expect, vi, beforeEach } from "vitest";
import { syncTodayMeetings } from "@domain/usecases/calendar/syncTodayMeetings";
import { composeLocalISO, composeMeetingEndISO } from "@domain/usecases/calendar/meetingTime";
import type { PlannedTask, PlannedTaskAction } from "@domain/entities/PlannedTask";
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
    plannedTaskId: null,
    startPromptedAt: null,
    startDismissed: false,
    endPromptCount: 0,
    lastEndPromptAt: null,
    ended: false,
    ...overrides,
  };
}

/**
 * Planejada do dia como `findForDate` devolveria — tipada como a entidade inteira
 * de propósito: `adoptPlannedTask` faz read-modify-write do objeto todo, e um stub
 * parcial esconderia campo perdido no spread.
 */
function makePlanned(name: string, overrides: Partial<PlannedTask> = {}): PlannedTask {
  return {
    id: `pt-${name}`,
    workspaceId: "ws-1",
    name,
    projectId: null,
    categoryId: null,
    billable: false,
    scheduleType: "specific_date",
    scheduleDate: "2026-07-01",
    recurringDays: null,
    periodStart: null,
    periodEnd: null,
    completedDates: [],
    actions: [],
    sortOrder: 3,
    createdAt: "2026-06-01T00:00:00.000Z",
    customValues: {},
    ...overrides,
  };
}

function makeDeps(
  events: CalendarEvent[],
  existing: TrackedMeeting[] = [],
  planned: PlannedTask[] = [],
  projects: { id: string; name: string }[] = [],
  categories: { id: string; name: string }[] = []
) {
  const importer = { getEvents: vi.fn(async () => events) };
  const trackedRepo = {
    listForDate: vi.fn(async () => existing),
    upsert: vi.fn(async () => {}),
    setPlannedTaskId: vi.fn(async () => {}),
    remove: vi.fn(async () => {}),
    pruneBefore: vi.fn(async () => {}),
  };
  const plannedRepo = {
    findForDate: vi.fn(async () => planned),
    save: vi.fn(async () => {}),
    update: vi.fn(async () => {}),
    // Resolve do mesmo array de `findForDate`: o alinhamento de horário busca a
    // planejada **pelo vínculo**, e um stub que devolve sempre `undefined`
    // deixaria o passo inteiro passando por "planejada apagada".
    findById: vi.fn(async (id: string) => planned.find((p) => p.id === id) ?? null),
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

    expect(result).toEqual({
      tracked: 1,
      plannedCreated: 1,
      plannedLinked: 0,
      plannedRetimed: 0,
      errors: [],
    });
    expect(deps.trackedRepo.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ calendarEventId: "evt1", title: "Daily", startedTaskId: null })
    );
    expect(deps.plannedRepo.save).toHaveBeenCalledTimes(1);
    expect(deps.trackedRepo.pruneBefore).toHaveBeenCalledWith("2026-07-01");
  });

  it("grava o vínculo sem reescrever a linha inteira da reunião", async () => {
    const deps = makeDeps([makeEvent()]);
    await syncTodayMeetings(deps, RANGE);

    // Escrita estreita de propósito: um upsert de linha inteira, partindo do que
    // foi lido no início do ciclo, reverteria o startedTaskId que o prompt grava.
    const created = deps.plannedRepo.save.mock.calls[0][0];
    expect(deps.trackedRepo.setPlannedTaskId).toHaveBeenCalledWith("evt1", created.id);
    expect(deps.trackedRepo.upsert).toHaveBeenCalledTimes(1);
  });

  it("ignora eventos de dia inteiro e sem horário de início", async () => {
    const deps = makeDeps([
      makeEvent({ id: "a", allDay: true }),
      makeEvent({ id: "b", startTime: undefined }),
    ]);
    const result = await syncTodayMeetings(deps, RANGE);
    expect(result).toEqual({
      tracked: 0,
      plannedCreated: 0,
      plannedLinked: 0,
      plannedRetimed: 0,
      errors: [],
    });
    expect(deps.trackedRepo.upsert).not.toHaveBeenCalled();
  });

  it("não re-rastreia eventos já conhecidos e inalterados (preserva estado)", async () => {
    // ISOs derivados de composeLocalISO para não depender do fuso da máquina.
    const existing: TrackedMeeting[] = [
      makeMeeting({
        startISO: composeLocalISO("2026-07-01", "10:00"),
        endISO: composeMeetingEndISO("2026-07-01", "10:00", "10:30"),
        startedTaskId: "task1",
        // Já tratada: vínculo preenchido é o que diz que não há o que fazer.
        plannedTaskId: "pt1",
        startPromptedAt: composeLocalISO("2026-07-01", "10:00"),
      }),
    ];
    const deps = makeDeps([makeEvent()], existing);
    const result = await syncTodayMeetings(deps, RANGE);
    expect(result).toEqual({
      tracked: 0,
      plannedCreated: 0,
      plannedLinked: 0,
      plannedRetimed: 0,
      errors: [],
    });
    expect(deps.trackedRepo.upsert).not.toHaveBeenCalled();
    expect(deps.trackedRepo.setPlannedTaskId).not.toHaveBeenCalled();
    expect(deps.trackedRepo.remove).not.toHaveBeenCalled();
  });

  it("cria a planejada de reunião já rastreada que ficou sem vínculo (auto-cura)", async () => {
    // O cenário que o bug de produção deixou: evento rastreado, prompt disparando,
    // e nenhuma planejada — o ciclo anterior falhou depois de rastrear.
    const existing = [makeMeeting({ startPromptedAt: composeLocalISO("2026-07-01", "10:00") })];
    const deps = makeDeps([makeEvent()], existing);
    const result = await syncTodayMeetings(deps, RANGE);

    expect(result).toEqual({
      tracked: 0,
      plannedCreated: 1,
      plannedLinked: 0,
      plannedRetimed: 0,
      errors: [],
    });
    expect(deps.plannedRepo.save).toHaveBeenCalledTimes(1);
  });

  it("falha ao criar a planejada não marca a reunião como resolvida", async () => {
    const deps = makeDeps([makeEvent()]);
    deps.plannedRepo.save.mockRejectedValueOnce(new Error("banco fora"));

    const result = await syncTodayMeetings(deps, RANGE);

    // O rastreamento foi gravado (é o que permite o prompt), mas o vínculo não —
    // então o ciclo seguinte tenta de novo em vez de pular o evento para sempre.
    expect(result.errors).toEqual(["banco fora"]);
    expect(result.plannedCreated).toBe(0);
    expect(deps.trackedRepo.setPlannedTaskId).not.toHaveBeenCalled();
    expect(deps.trackedRepo.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ calendarEventId: "evt1", plannedTaskId: null })
    );
    // A poda não pode ser vítima do erro de uma reunião.
    expect(deps.trackedRepo.pruneBefore).toHaveBeenCalledWith("2026-07-01");
  });

  it("um erro numa reunião não impede as anteriores nem as seguintes", async () => {
    const deps = makeDeps([
      makeEvent({ id: "a", title: "Primeira" }),
      makeEvent({ id: "b", title: "Segunda" }),
      makeEvent({ id: "c", title: "Terceira" }),
    ]);
    deps.plannedRepo.save
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error("boom"))
      .mockResolvedValueOnce(undefined);

    const result = await syncTodayMeetings(deps, RANGE);

    expect(result.errors).toEqual(["boom"]);
    expect(result.plannedCreated).toBe(2);
    const linked = deps.trackedRepo.setPlannedTaskId.mock.calls.map((c: string[]) => c[0]);
    expect(linked).toEqual(["a", "c"]);
  });

  describe("reunião e planejada de mesmo nome (ex.: item do Monday)", () => {
    it("adota a planejada existente em vez de criar uma segunda", async () => {
      const deps = makeDeps([makeEvent()], [], [makePlanned("daily")]);
      const result = await syncTodayMeetings(deps, RANGE);

      expect(result).toEqual({
        tracked: 1,
        plannedCreated: 0,
        plannedLinked: 1,
        plannedRetimed: 0,
        errors: [],
      });
      expect(deps.plannedRepo.save).not.toHaveBeenCalled();
      expect(deps.trackedRepo.setPlannedTaskId).toHaveBeenCalledWith("evt1", "pt-daily");
    });

    it("soma a ação de abrir a reunião à planejada adotada, preservando o resto", async () => {
      const deps = makeDeps(
        [makeEvent({ conferenceLink: "https://meet.google.com/abc" })],
        [],
        [makePlanned("daily", { completedDates: ["2026-06-30"], sortOrder: 7 })]
      );
      await syncTodayMeetings(deps, RANGE);

      // `update` reescreve a entidade inteira: o que não é a ação tem de sobreviver.
      expect(deps.plannedRepo.update).toHaveBeenCalledWith(
        expect.objectContaining({
          id: "pt-daily",
          actions: [{ type: "open_url", value: "https://meet.google.com/abc" }],
          completedDates: ["2026-06-30"],
          sortOrder: 7,
        })
      );
    });

    it("não pendura o link do evento numa planejada de período (cresceria por dia)", async () => {
      // Sem conferenceLink, o htmlLink é único por ocorrência: pendurá-lo numa
      // planejada de longa vida somaria uma ação por dia, indefinidamente.
      const deps = makeDeps(
        [makeEvent({ htmlLink: "https://calendar.google.com/event?eid=instancia-de-hoje" })],
        [],
        [
          makePlanned("daily", {
            scheduleType: "period",
            scheduleDate: null,
            periodStart: "2026-06-01",
            periodEnd: "2026-09-30",
          }),
        ]
      );
      const result = await syncTodayMeetings(deps, RANGE);

      expect(result.plannedLinked).toBe(1);
      expect(deps.plannedRepo.update).not.toHaveBeenCalled();
    });

    it("não duplica a ação quando a planejada adotada já a tem", async () => {
      const action: PlannedTaskAction = {
        type: "open_url",
        value: "https://meet.google.com/abc",
      };
      const deps = makeDeps(
        [makeEvent({ conferenceLink: action.value })],
        [],
        [makePlanned("daily", { actions: [action] })]
      );
      await syncTodayMeetings(deps, RANGE);

      // A gravação acontece — é o horário que falta nesta planejada —, e é
      // justamente por isso que a lista de ações precisa ser conferida aqui:
      // "não escreveu" deixou de ser prova de "não duplicou".
      const updated = deps.plannedRepo.update.mock.calls[0][0];
      expect(updated.actions).toEqual([action]);
      expect(updated.startTime).toBe("10:00");
    });

    it("a planejada adotada de dia único recebe o horário do evento", async () => {
      // O evento não traz link de conferência — e é justamente aí que a hora se
      // perdia: a adoção desistia no `return` do link antes de olhar o horário.
      const deps = makeDeps([makeEvent()], [], [makePlanned("daily")]);
      const result = await syncTodayMeetings(deps, RANGE);

      expect(result.plannedLinked).toBe(1);
      expect(deps.plannedRepo.update).toHaveBeenCalledWith(
        expect.objectContaining({ id: "pt-daily", startTime: "10:00", endTime: "10:30" })
      );
    });

    it("não escreve horário em planejada recorrente (valeria para todo dia da recorrência)", async () => {
      const deps = makeDeps(
        [makeEvent({ conferenceLink: "https://meet.google.com/abc" })],
        [],
        [makePlanned("daily", { scheduleType: "recurring", scheduleDate: null, recurringDays: [3] })]
      );
      await syncTodayMeetings(deps, RANGE);

      // A ação entra; a hora, não — senão o Lançamento Manual ofereceria 10:00
      // num dia em que a reunião não acontece.
      const updated = deps.plannedRepo.update.mock.calls[0][0];
      expect(updated.actions).toEqual([{ type: "open_url", value: "https://meet.google.com/abc" }]);
      expect(updated.startTime).toBeUndefined();
      expect(updated.endTime).toBeUndefined();
    });

    it("não escreve horário em planejada de período", async () => {
      const deps = makeDeps(
        [makeEvent({ conferenceLink: "https://meet.google.com/abc" })],
        [],
        [
          makePlanned("daily", {
            scheduleType: "period",
            scheduleDate: null,
            periodStart: "2026-06-01",
            periodEnd: "2026-09-30",
          }),
        ]
      );
      await syncTodayMeetings(deps, RANGE);

      const updated = deps.plannedRepo.update.mock.calls[0][0];
      expect(updated.startTime).toBeUndefined();
      expect(updated.endTime).toBeUndefined();
    });

    it("não reescreve a planejada cujo horário e ação já batem", async () => {
      const action: PlannedTaskAction = { type: "open_url", value: "https://meet.google.com/abc" };
      const deps = makeDeps(
        [makeEvent({ conferenceLink: action.value })],
        [],
        [makePlanned("daily", { actions: [action], startTime: "10:00", endTime: "10:30" })]
      );
      await syncTodayMeetings(deps, RANGE);

      expect(deps.plannedRepo.update).not.toHaveBeenCalled();
    });

    it("duas reuniões de mesmo nome no dia compartilham uma planejada", async () => {
      const deps = makeDeps([
        makeEvent({ id: "a", startTime: "10:00" }),
        makeEvent({ id: "b", startTime: "16:00" }),
      ]);
      const result = await syncTodayMeetings(deps, RANGE);

      expect(result).toEqual({
        tracked: 2,
        plannedCreated: 1,
        plannedLinked: 1,
        plannedRetimed: 0,
        errors: [],
      });
    });
  });

  it("vínculo apontando para planejada inexistente não gera outra no mesmo dia", async () => {
    // Planejada apagada à mão (ou pela poda do Monday) não volta.
    const existing = [makeMeeting({ plannedTaskId: "apagada" })];
    const deps = makeDeps([makeEvent()], existing);
    const result = await syncTodayMeetings(deps, RANGE);

    expect(result).toEqual({
      tracked: 0,
      plannedCreated: 0,
      plannedLinked: 0,
      plannedRetimed: 0,
      errors: [],
    });
    expect(deps.plannedRepo.save).not.toHaveBeenCalled();
    // Nem ressuscita pelo alinhamento de horário, que também parte do vínculo.
    expect(deps.plannedRepo.update).not.toHaveBeenCalled();
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

  describe("horário da planejada já vinculada", () => {
    it("cura a planejada vinculada que ficou sem hora, sem esperar o dia seguinte", async () => {
      // Reunião com vínculo não é reavaliada pela adoção — sem este passo, a
      // planejada que nasceu sem hora só ganharia horário na próxima ocorrência.
      const existing = [makeMeeting({ plannedTaskId: "pt-daily" })];
      const deps = makeDeps([makeEvent()], existing, [makePlanned("daily")]);
      const result = await syncTodayMeetings(deps, RANGE);

      expect(result.plannedRetimed).toBe(1);
      expect(deps.plannedRepo.update).toHaveBeenCalledWith(
        expect.objectContaining({ id: "pt-daily", startTime: "10:00", endTime: "10:30" })
      );
    });

    it("remarcação no mesmo dia alinha a hora da planejada vinculada", async () => {
      const existing = [
        makeMeeting({
          plannedTaskId: "pt-daily",
          startISO: composeLocalISO("2026-07-01", "10:00"),
          endISO: composeMeetingEndISO("2026-07-01", "10:00", "10:30"),
        }),
      ];
      const deps = makeDeps(
        [makeEvent({ startTime: "15:00", endTime: "15:30" })],
        existing,
        [makePlanned("daily", { startTime: "10:00", endTime: "10:30" })]
      );
      const result = await syncTodayMeetings(deps, RANGE);

      expect(result.plannedRetimed).toBe(1);
      expect(deps.plannedRepo.update).toHaveBeenCalledWith(
        expect.objectContaining({ id: "pt-daily", startTime: "15:00", endTime: "15:30" })
      );
    });

    it("horário que já bate não vira UPDATE (o ciclo roda a cada 2 min)", async () => {
      const existing = [makeMeeting({ plannedTaskId: "pt-daily" })];
      const deps = makeDeps(
        [makeEvent()],
        existing,
        [makePlanned("daily", { startTime: "10:00", endTime: "10:30" })]
      );
      const result = await syncTodayMeetings(deps, RANGE);

      expect(result.plannedRetimed).toBe(0);
      expect(deps.plannedRepo.update).not.toHaveBeenCalled();
    });

    it("reunião que sumiu da agenda não tem horário a alinhar", async () => {
      // Sumida e já iniciada sobrevive ao reconcile, mas sem evento não há de
      // onde tirar hora — nem motivo para ler a planejada.
      const existing = [
        makeMeeting({ calendarEventId: "gone", startedTaskId: "task1", plannedTaskId: "pt-daily" }),
      ];
      const deps = makeDeps([], existing, [makePlanned("daily")]);
      await syncTodayMeetings(deps, RANGE);

      expect(deps.plannedRepo.findById).not.toHaveBeenCalled();
    });

    it("falha ao alinhar uma planejada não derruba o ciclo", async () => {
      const existing = [makeMeeting({ plannedTaskId: "pt-daily" })];
      const deps = makeDeps([makeEvent()], existing, [makePlanned("daily")]);
      deps.plannedRepo.update.mockRejectedValueOnce(new Error("banco fora"));

      const result = await syncTodayMeetings(deps, RANGE);

      expect(result.errors).toEqual(["banco fora"]);
      expect(result.plannedRetimed).toBe(0);
      expect(deps.trackedRepo.pruneBefore).toHaveBeenCalledWith("2026-07-01");
    });
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
          // Já tratada: isola o teste na reconciliação, sem criar planejada.
          plannedTaskId: "pt1",
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
          plannedTaskId: "pt1",
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
