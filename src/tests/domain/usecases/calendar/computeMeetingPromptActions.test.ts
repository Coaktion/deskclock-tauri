import { describe, it, expect } from "vitest";
import { computeMeetingPromptActions } from "@domain/usecases/calendar/computeMeetingPromptActions";
import type { TrackedMeeting } from "@domain/integrations/TrackedMeeting";

function makeMeeting(overrides: Partial<TrackedMeeting> = {}): TrackedMeeting {
  return {
    calendarEventId: "evt1",
    date: "2026-07-01",
    title: "Daily",
    startISO: "2026-07-01T10:00:00.000Z",
    endISO: "2026-07-01T10:30:00.000Z",
    startedTaskId: null,
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

    it("não pede início de novo se já foi perguntado (prompt único)", () => {
      const actions = computeMeetingPromptActions("2026-07-01T10:05:00.000Z", [
        makeMeeting({ startPromptedAt: "2026-07-01T10:00:00.000Z" }),
      ]);
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
