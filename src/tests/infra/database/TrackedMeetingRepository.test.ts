import { describe, it, expect, vi, beforeEach } from "vitest";
import type { TrackedMeeting } from "@domain/integrations/TrackedMeeting";

const mockDb = {
  select: vi.fn(),
  execute: vi.fn(),
};

vi.mock("@infra/database/db", () => ({
  getDb: vi.fn(async () => mockDb),
}));

const { TrackedMeetingRepository } = await import("@infra/database/TrackedMeetingRepository");

function makeRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    calendar_event_id: "evt1",
    date: "2026-07-01",
    title: "Daily",
    start_iso: "2026-07-01T10:00:00.000Z",
    end_iso: "2026-07-01T10:30:00.000Z",
    started_task_id: null,
    planned_task_id: null,
    start_prompted_at: null,
    start_dismissed: 0,
    end_prompt_count: 0,
    last_end_prompt_at: null,
    ended: 0,
    ...overrides,
  };
}

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

describe("TrackedMeetingRepository", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDb.select.mockResolvedValue([]);
    mockDb.execute.mockResolvedValue({ rowsAffected: 1, lastInsertId: 0 });
  });

  it("listForDate mapeia linhas para TrackedMeeting", async () => {
    mockDb.select.mockResolvedValueOnce([
      makeRow({ start_dismissed: 1, ended: 1, end_prompt_count: 2 }),
    ]);
    const repo = new TrackedMeetingRepository();
    const result = await repo.listForDate("2026-07-01");

    expect(mockDb.select).toHaveBeenCalledWith(expect.stringContaining("WHERE date = $1"), [
      "2026-07-01",
    ]);
    expect(result).toEqual([makeMeeting({ startDismissed: true, ended: true, endPromptCount: 2 })]);
  });

  it("listForDate retorna vazio quando não há linhas", async () => {
    const repo = new TrackedMeetingRepository();
    expect(await repo.listForDate("2026-07-01")).toEqual([]);
  });

  it("upsert serializa booleanos como 0/1 e usa ON CONFLICT", async () => {
    const repo = new TrackedMeetingRepository();
    await repo.upsert(
      makeMeeting({
        startedTaskId: "task1",
        plannedTaskId: "pt1",
        startDismissed: true,
        ended: true,
        endPromptCount: 3,
      })
    );

    const [sql, params] = mockDb.execute.mock.calls[0];
    expect(sql).toContain("ON CONFLICT(calendar_event_id) DO UPDATE");
    expect(params).toEqual([
      "evt1",
      "2026-07-01",
      "Daily",
      "2026-07-01T10:00:00.000Z",
      "2026-07-01T10:30:00.000Z",
      "task1",
      "pt1",
      null,
      1,
      3,
      null,
      1,
    ]);
  });

  it("upsert grava o vínculo da planejada e o preserva no ON CONFLICT", async () => {
    const repo = new TrackedMeetingRepository();
    await repo.upsert(makeMeeting({ plannedTaskId: "pt1" }));

    const [sql, params] = mockDb.execute.mock.calls[0];
    expect(sql).toContain("planned_task_id");
    expect(sql).toContain("planned_task_id=$7");
    expect(params[6]).toBe("pt1");
  });

  it("upsert grava endISO null", async () => {
    const repo = new TrackedMeetingRepository();
    await repo.upsert(makeMeeting({ endISO: null }));
    const [, params] = mockDb.execute.mock.calls[0];
    expect(params[4]).toBeNull();
  });

  it("setPlannedTaskId grava só a coluna do vínculo", async () => {
    const repo = new TrackedMeetingRepository();
    await repo.setPlannedTaskId("evt1", "pt1");

    const [sql, params] = mockDb.execute.mock.calls[0];
    // UPDATE de uma coluna, não upsert de linha inteira: o prompt de reunião grava
    // startedTaskId fora do ciclo de sync, e reescrever a linha o perderia.
    expect(sql).toContain("UPDATE calendar_tracked_meetings SET planned_task_id");
    expect(sql).not.toContain("INSERT");
    expect(params).toEqual(["evt1", "pt1"]);
  });

  it("remove exclui a reunião pelo calendarEventId", async () => {
    const repo = new TrackedMeetingRepository();
    await repo.remove("evt1");
    expect(mockDb.execute).toHaveBeenCalledWith(
      expect.stringContaining("WHERE calendar_event_id = $1"),
      ["evt1"]
    );
  });

  it("pruneBefore remove datas anteriores", async () => {
    const repo = new TrackedMeetingRepository();
    await repo.pruneBefore("2026-07-01");
    expect(mockDb.execute).toHaveBeenCalledWith(expect.stringContaining("WHERE date < $1"), [
      "2026-07-01",
    ]);
  });
});
