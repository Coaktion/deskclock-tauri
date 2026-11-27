import { describe, it, expect, vi } from "vitest";
import type { Task } from "@domain/entities/Task";
import { dispatchLocalApiRequest } from "@presentation/localApi/dispatch";
import { LlmNetworkError } from "@infra/integrations/llm/errors";
import { localISO } from "../../../helpers/localTime";
import { makeDeps, makeTask, TODAY, WS_ATIVO, WS_OUTRO } from "../fakeDeps";

function setup(notConfiguredMessage: string | null = null) {
  const deps = makeDeps();
  const llm = { complete: vi.fn(async () => ({ text: "Resumo." })), listModels: vi.fn() };
  const saveLimits = vi.fn(async () => {});
  deps.llm.mockReturnValue({ notConfiguredMessage, createLlm: () => llm, saveLimits });
  return { deps, llm, saveLimits };
}

function done(day: number, overrides: Partial<Task> = {}): Task {
  return makeTask({
    id: `t-${day}`,
    status: "completed",
    startTime: localISO(2026, 9, day, 9),
    endTime: localISO(2026, 9, day, 10),
    durationSeconds: 3600,
    ...overrides,
  });
}

describe("daySummaries.list", () => {
  it("lê do banco os dias do período, do mais recente, sem chamar o provedor", async () => {
    const { deps, llm } = setup();
    deps.daySummaryRepo.findByDays.mockResolvedValue([
      { dateISO: "2026-09-13", workspaceId: WS_ATIVO, summary: "A.", generatedAt: "g1" },
      { dateISO: "2026-09-14", workspaceId: WS_ATIVO, summary: "B.", generatedAt: "g2" },
    ]);
    const res = await dispatchLocalApiRequest(deps, "daySummaries.list", {
      from: "2026-09-13",
      to: "2026-09-15",
    });
    expect(res.status).toBe(200);
    expect(deps.daySummaryRepo.findByDays).toHaveBeenCalledWith(WS_ATIVO, [
      "2026-09-13",
      "2026-09-14",
      "2026-09-15",
    ]);
    expect(res.body).toEqual({
      workspaceId: WS_ATIVO,
      from: "2026-09-13",
      to: "2026-09-15",
      summaries: [
        { date: "2026-09-14", summary: "B.", generatedAt: "g2" },
        { date: "2026-09-13", summary: "A.", generatedAt: "g1" },
      ],
    });
    expect(llm.complete).not.toHaveBeenCalled();
  });

  it("sem período é hoje; workspaceId escolhe o workspace", async () => {
    const { deps } = setup();
    await dispatchLocalApiRequest(deps, "daySummaries.list", { workspaceId: WS_OUTRO });
    expect(deps.daySummaryRepo.findByDays).toHaveBeenCalledWith(WS_OUTRO, [TODAY]);
  });

  it("período acima de 366 dias é 400", async () => {
    const { deps } = setup();
    const res = await dispatchLocalApiRequest(deps, "daySummaries.list", {
      from: "2025-01-01",
      to: "2026-09-15",
    });
    expect(res.status).toBe(400);
  });

  it("sem provedor é 409", async () => {
    const { deps } = setup("Provedor de IA não configurado.");
    expect((await dispatchLocalApiRequest(deps, "daySummaries.list", {})).status).toBe(409);
  });
});

describe("daySummaries.generate", () => {
  it("gera os dias da busca, com hoje regerado e o cache lido, e grava a cota", async () => {
    const { deps, llm, saveLimits } = setup();
    const tasks = [done(15), done(14), done(14, { id: "t-14b" })];
    deps.taskRepo.findByDateRange.mockImplementation(async (start: string, end: string) =>
      tasks.filter((t) => t.startTime >= start && t.startTime <= end)
    );
    deps.daySummaryRepo.findByDays.mockResolvedValue([
      { dateISO: "2026-09-14", workspaceId: WS_ATIVO, summary: "Cache.", generatedAt: "g" },
      { dateISO: TODAY, workspaceId: WS_ATIVO, summary: "Velho.", generatedAt: "g" },
    ]);
    llm.complete.mockResolvedValue({ text: "Hoje.", limits: { requestsRemaining: 3 } } as never);

    const res = await dispatchLocalApiRequest(deps, "daySummaries.generate", {
      body: { from: "2026-09-14", to: TODAY },
    });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      workspaceId: WS_ATIVO,
      from: "2026-09-14",
      to: TODAY,
      dayCount: 2,
      coveredDays: [TODAY, "2026-09-14"],
      scopeNote: null,
      summaries: [
        { date: TODAY, summary: "Hoje.", source: "generated" },
        { date: "2026-09-14", summary: "Cache.", source: "cache" },
      ],
      errors: [],
      skipped: [],
    });
    expect(llm.complete).toHaveBeenCalledTimes(1);
    expect(saveLimits).toHaveBeenCalledWith({ requestsRemaining: 3 });
  });

  it("acima de 5 dias cobre os mais recentes e avisa", async () => {
    const { deps } = setup();
    const tasks = [9, 10, 11, 12, 13, 14, 15].map((d) => done(d));
    deps.taskRepo.findByDateRange.mockResolvedValue(tasks);
    const res = await dispatchLocalApiRequest(deps, "daySummaries.generate", {
      body: { from: "2026-09-09", to: TODAY },
    });
    const body = res.body as { dayCount: number; coveredDays: string[]; scopeNote: string };
    expect(body.dayCount).toBe(7);
    expect(body.coveredDays).toEqual([
      "2026-09-15",
      "2026-09-14",
      "2026-09-13",
      "2026-09-12",
      "2026-09-11",
    ]);
    expect(body.scopeNote).toBe("A busca trouxe 7 dias; o resumo cobre os 5 mais recentes.");
  });

  it("erro de um dia vem traduzido, e não derruba a resposta", async () => {
    const { deps, llm } = setup();
    deps.taskRepo.findByDateRange.mockResolvedValue([done(15)]);
    llm.complete.mockRejectedValue(new LlmNetworkError("caiu"));
    const res = await dispatchLocalApiRequest(deps, "daySummaries.generate", {});
    expect(res.status).toBe(200);
    expect((res.body as { errors: unknown[] }).errors).toEqual([
      {
        date: TODAY,
        message: "Falha de conexão com o provedor. Verifique a URL e a sua internet.",
      },
    ]);
  });

  it("filtro de billable fora do tipo é 400; sem provedor é 409", async () => {
    const { deps } = setup();
    const res = await dispatchLocalApiRequest(deps, "daySummaries.generate", {
      body: { billable: "sim" },
    });
    expect(res.status).toBe(400);
    const off = setup("Provedor de IA não configurado.");
    expect((await dispatchLocalApiRequest(off.deps, "daySummaries.generate", {})).status).toBe(409);
    expect(off.deps.taskRepo.findByDateRange).not.toHaveBeenCalled();
  });
});
