import { describe, it, expect } from "vitest";
import {
  computeMeetingPromptActions,
  type RunningTaskSnapshot,
} from "@domain/usecases/calendar/computeMeetingPromptActions";
import type { TrackedMeeting } from "@domain/integrations/TrackedMeeting";

function makeMeeting(overrides: Partial<TrackedMeeting> = {}): TrackedMeeting {
  return {
    calendarEventId: "evt1",
    date: "2026-07-01",
    title: "Daily",
    startISO: "2026-07-01T10:00:00.000Z",
    endISO: "2026-07-01T10:30:00.000Z",
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

describe("computeMeetingPromptActions", () => {
  describe("prompt de início", () => {
    it("pede início quando now está no horário de começo e nunca foi perguntado", () => {
      const actions = computeMeetingPromptActions("2026-07-01T10:00:00.000Z", [makeMeeting()]);
      expect(actions).toEqual([
        { kind: "start", meeting: expect.objectContaining({ calendarEventId: "evt1" }) },
      ]);
    });

    it("não pede início antes do horário de começo", () => {
      const actions = computeMeetingPromptActions("2026-07-01T09:59:00.000Z", [makeMeeting()]);
      expect(actions).toEqual([]);
    });

    it("ainda oferece início se o app abriu no meio da reunião (dentro do evento)", () => {
      const actions = computeMeetingPromptActions("2026-07-01T10:15:00.000Z", [makeMeeting()]);
      expect(actions).toHaveLength(1);
      expect(actions[0].kind).toBe("start");
    });

    it("não oferece início após o fim do evento (fora da janela)", () => {
      const actions = computeMeetingPromptActions("2026-07-01T10:31:00.000Z", [makeMeeting()]);
      expect(actions).toEqual([]);
    });

    it("antecipa o prompt de início conforme startLeadMs", () => {
      const opts = { startLeadMs: 60_000 };
      // 1 min antes do início já dispara
      expect(
        computeMeetingPromptActions("2026-07-01T09:59:00.000Z", [makeMeeting()], opts)
      ).toHaveLength(1);
      // 2 min antes ainda não
      expect(
        computeMeetingPromptActions("2026-07-01T09:58:00.000Z", [makeMeeting()], opts)
      ).toEqual([]);
    });

    it("respeita startPromptGraceMs quando fornecido", () => {
      const opts = { startPromptGraceMs: 5 * 60 * 1000 };
      expect(
        computeMeetingPromptActions("2026-07-01T10:04:00.000Z", [makeMeeting()], opts)
      ).toHaveLength(1);
      expect(
        computeMeetingPromptActions("2026-07-01T10:06:00.000Z", [makeMeeting()], opts)
      ).toEqual([]);
    });

    it("não pede início se já foi dispensado", () => {
      const actions = computeMeetingPromptActions("2026-07-01T10:00:00.000Z", [
        makeMeeting({ startDismissed: true }),
      ]);
      expect(actions).toEqual([]);
    });

    it("sem startRepromptMs, não pede início de novo se já foi perguntado (único)", () => {
      const actions = computeMeetingPromptActions("2026-07-01T10:05:00.000Z", [
        makeMeeting({ startPromptedAt: "2026-07-01T10:00:00.000Z" }),
      ]);
      expect(actions).toEqual([]);
    });

    it("com startRepromptMs, NÃO re-pergunta antes da cadência (Adiar)", () => {
      const actions = computeMeetingPromptActions(
        "2026-07-01T10:03:00.000Z",
        [makeMeeting({ startPromptedAt: "2026-07-01T10:00:00.000Z" })],
        { startRepromptMs: 5 * 60 * 1000 }
      );
      expect(actions).toEqual([]);
    });

    it("com startRepromptMs, re-pergunta o início após a cadência (Adiar 5 min)", () => {
      const actions = computeMeetingPromptActions(
        "2026-07-01T10:05:00.000Z",
        [makeMeeting({ startPromptedAt: "2026-07-01T10:00:00.000Z" })],
        { startRepromptMs: 5 * 60 * 1000 }
      );
      expect(actions).toHaveLength(1);
      expect(actions[0].kind).toBe("start");
    });

    it("com startRepromptMs, 'Dispensar' (startDismissed) encerra mesmo com cadência", () => {
      const actions = computeMeetingPromptActions(
        "2026-07-01T10:10:00.000Z",
        [makeMeeting({ startPromptedAt: "2026-07-01T10:00:00.000Z", startDismissed: true })],
        { startRepromptMs: 5 * 60 * 1000 }
      );
      expect(actions).toEqual([]);
    });

    it("não pede início se o prompt foi exibido mas não respondido e a janela expirou", () => {
      // Prompt emitido às 10:00, usuário nunca respondeu, janela do evento já passou.
      const actions = computeMeetingPromptActions("2026-07-01T10:31:00.000Z", [
        makeMeeting({ startPromptedAt: "2026-07-01T10:00:00.000Z" }),
      ]);
      expect(actions).toEqual([]);
    });

    it("não pede início para reunião já encerrada", () => {
      const actions = computeMeetingPromptActions("2026-07-01T10:00:00.000Z", [
        makeMeeting({ ended: true }),
      ]);
      expect(actions).toEqual([]);
    });
  });

  describe("prompt de fim", () => {
    const started = () =>
      makeMeeting({ startedTaskId: "task1", startPromptedAt: "2026-07-01T10:00:00.000Z" });

    it("pede fim quando a tarefa foi iniciada e o término já passou", () => {
      const actions = computeMeetingPromptActions("2026-07-01T10:30:00.000Z", [started()]);
      expect(actions).toEqual([
        { kind: "end", meeting: expect.objectContaining({ startedTaskId: "task1" }) },
      ]);
    });

    it("não pede fim antes do horário de término", () => {
      const actions = computeMeetingPromptActions("2026-07-01T10:29:00.000Z", [started()]);
      expect(actions).toEqual([]);
    });

    it("não re-pergunta o fim antes de 15 min desde o último prompt", () => {
      const actions = computeMeetingPromptActions(
        "2026-07-01T10:40:00.000Z",
        [started()].map((m) => ({
          ...m,
          endPromptCount: 1,
          lastEndPromptAt: "2026-07-01T10:30:00.000Z",
        }))
      );
      expect(actions).toEqual([]);
    });

    it("re-pergunta o fim após 15 min desde o último prompt", () => {
      const actions = computeMeetingPromptActions("2026-07-01T10:45:00.000Z", [
        { ...started(), endPromptCount: 1, lastEndPromptAt: "2026-07-01T10:30:00.000Z" },
      ]);
      expect(actions).toHaveLength(1);
      expect(actions[0].kind).toBe("end");
    });

    it("respeita endRepromptMs customizado", () => {
      const meeting = {
        ...started(),
        endPromptCount: 1,
        lastEndPromptAt: "2026-07-01T10:30:00.000Z",
      };
      expect(
        computeMeetingPromptActions("2026-07-01T10:35:00.000Z", [meeting], {
          endRepromptMs: 5 * 60 * 1000,
        })
      ).toHaveLength(1);
    });

    it("não pede fim se endISO for null", () => {
      const actions = computeMeetingPromptActions("2026-07-01T23:00:00.000Z", [
        { ...started(), endISO: null },
      ]);
      expect(actions).toEqual([]);
    });

    it("não pede fim para reunião já encerrada", () => {
      const actions = computeMeetingPromptActions("2026-07-01T10:30:00.000Z", [
        { ...started(), ended: true },
      ]);
      expect(actions).toEqual([]);
    });
  });

  describe("reunião iniciada à mão (attach)", () => {
    // Tarefa iniciada às 10:00, dentro da reunião de 10:00–10:30 do makeMeeting.
    function makeRunning(overrides: Partial<RunningTaskSnapshot> = {}): RunningTaskSnapshot {
      return {
        id: "task-manual",
        name: "Daily",
        plannedTaskId: "pt-daily",
        startTimeISO: "2026-07-01T10:00:00.000Z",
        ...overrides,
      };
    }
    const running = makeRunning();

    it("anexa a tarefa em execução que veio da planejada da reunião, em vez de pedir início", () => {
      const actions = computeMeetingPromptActions(
        "2026-07-01T10:00:00.000Z",
        [makeMeeting({ title: "Outro nome", plannedTaskId: "pt-daily" })],
        { runningTask: running }
      );
      expect(actions).toEqual([
        {
          kind: "attach",
          meeting: expect.objectContaining({ plannedTaskId: "pt-daily" }),
          taskId: "task-manual",
        },
      ]);
    });

    it("anexa por nome exato quando não há vínculo com planejada", () => {
      const actions = computeMeetingPromptActions("2026-07-01T10:00:00.000Z", [makeMeeting()], {
        runningTask: makeRunning({ name: " daily ", plannedTaskId: null }),
      });
      expect(actions).toHaveLength(1);
      expect(actions[0].kind).toBe("attach");
    });

    it("não anexa tarefa de outro nome — o prompt de início continua valendo", () => {
      const actions = computeMeetingPromptActions("2026-07-01T10:00:00.000Z", [makeMeeting()], {
        runningTask: makeRunning({
          id: "task-outra",
          name: "Refatoração",
          plannedTaskId: "pt-outra",
        }),
      });
      expect(actions).toHaveLength(1);
      expect(actions[0].kind).toBe("start");
    });

    it("não anexa fora da janela do evento — tarefa de mesmo nome antes da hora não é a reunião", () => {
      const actions = computeMeetingPromptActions("2026-07-01T08:00:00.000Z", [makeMeeting()], {
        runningTask: running,
      });
      expect(actions).toEqual([]);
    });

    it("cala o re-prompt de início: anexa mesmo com a cadência de Adiar vencida", () => {
      const actions = computeMeetingPromptActions(
        "2026-07-01T10:05:00.000Z",
        [makeMeeting({ startPromptedAt: "2026-07-01T10:00:00.000Z" })],
        { startRepromptMs: 5 * 60 * 1000, runningTask: running }
      );
      expect(actions).toHaveLength(1);
      expect(actions[0].kind).toBe("attach");
    });

    it("anexa dentro da janela mesmo antes da cadência vencer, para não deixar o prompt escapar depois", () => {
      const actions = computeMeetingPromptActions(
        "2026-07-01T10:02:00.000Z",
        [makeMeeting({ startPromptedAt: "2026-07-01T10:00:00.000Z" })],
        { startRepromptMs: 5 * 60 * 1000, runningTask: running }
      );
      expect(actions).toHaveLength(1);
      expect(actions[0].kind).toBe("attach");
    });

    it("reunião dispensada não é anexada — 'Dispensar' é decisão explícita do usuário", () => {
      const actions = computeMeetingPromptActions(
        "2026-07-01T10:00:00.000Z",
        [makeMeeting({ startDismissed: true })],
        { runningTask: running }
      );
      expect(actions).toEqual([]);
    });

    it("reunião já iniciada segue no fluxo de fim, sem anexar de novo", () => {
      const actions = computeMeetingPromptActions(
        "2026-07-01T10:30:00.000Z",
        [makeMeeting({ startedTaskId: "task-manual" })],
        { runningTask: running }
      );
      expect(actions).toHaveLength(1);
      expect(actions[0].kind).toBe("end");
    });

    it("sem tarefa em execução, o comportamento é o de sempre", () => {
      const actions = computeMeetingPromptActions("2026-07-01T10:00:00.000Z", [makeMeeting()], {
        runningTask: null,
      });
      expect(actions).toHaveLength(1);
      expect(actions[0].kind).toBe("start");
    });

    it("não anexa por nome tarefa iniciada antes da janela, mesmo ainda rodando", () => {
      // "Daily" das 8h ainda em execução às 10h não é a Daily das 10h: anexá-la
      // calaria o prompt e, ao parar essa tarefa, encerraria a reunião nunca vivida.
      const actions = computeMeetingPromptActions("2026-07-01T10:00:00.000Z", [makeMeeting()], {
        runningTask: makeRunning({
          plannedTaskId: null,
          startTimeISO: "2026-07-01T08:00:00.000Z",
        }),
      });
      expect(actions).toHaveLength(1);
      expect(actions[0].kind).toBe("start");
    });

    it("anexa pelo vínculo da planejada mesmo iniciada adiantado — é a planejada daquela reunião", () => {
      const actions = computeMeetingPromptActions(
        "2026-07-01T10:00:00.000Z",
        [makeMeeting({ plannedTaskId: "pt-daily" })],
        { runningTask: makeRunning({ startTimeISO: "2026-07-01T09:30:00.000Z" }) }
      );
      expect(actions).toHaveLength(1);
      expect(actions[0].kind).toBe("attach");
    });

    it("duas reuniões na mesma planejada: só a da janela corrente é anexada", () => {
      // syncTodayMeetings faz duas reuniões de mesmo nome compartilharem uma
      // planejada. Anexar a da tarde junto encerraria as duas ao parar a tarefa.
      const meetings = [
        makeMeeting({ calendarEventId: "manha", plannedTaskId: "pt-daily" }),
        makeMeeting({
          calendarEventId: "tarde",
          plannedTaskId: "pt-daily",
          startISO: "2026-07-01T17:00:00.000Z",
          endISO: "2026-07-01T17:30:00.000Z",
        }),
      ];
      const actions = computeMeetingPromptActions("2026-07-01T10:00:00.000Z", meetings, {
        runningTask: running,
      });
      expect(actions).toEqual([
        {
          kind: "attach",
          meeting: expect.objectContaining({ calendarEventId: "manha" }),
          taskId: "task-manual",
        },
      ]);
    });

    it("tarefa sem nome e sem vínculo não anexa nada", () => {
      const actions = computeMeetingPromptActions("2026-07-01T10:00:00.000Z", [makeMeeting()], {
        runningTask: makeRunning({ id: "task-anon", name: null, plannedTaskId: null }),
      });
      expect(actions).toHaveLength(1);
      expect(actions[0].kind).toBe("start");
    });
  });

  it("processa múltiplas reuniões independentemente", () => {
    const meetings = [
      makeMeeting({
        calendarEventId: "a",
        startISO: "2026-07-01T10:00:00.000Z",
        endISO: "2026-07-01T11:00:00.000Z",
      }),
      makeMeeting({
        calendarEventId: "b",
        startedTaskId: "t2",
        startPromptedAt: "2026-07-01T09:00:00.000Z",
        startISO: "2026-07-01T09:00:00.000Z",
        endISO: "2026-07-01T09:30:00.000Z",
      }),
    ];
    const actions = computeMeetingPromptActions("2026-07-01T10:00:00.000Z", meetings);
    expect(actions).toHaveLength(2);
    expect(actions.map((a) => a.kind).sort()).toEqual(["end", "start"]);
  });
});
