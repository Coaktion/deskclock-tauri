import { describe, it, expect, vi } from "vitest";
import type { DaySummary } from "@domain/entities/DaySummary";
import type { Task } from "@domain/entities/Task";
import type { ILlmApi } from "@domain/integrations/ILlmApi";
import type { IntegrationFactories } from "@presentation/contexts/IntegrationsContext";
import {
  buildDaySummarySource,
  LLM_NOT_CONNECTED,
  runDaySummaries,
  saveLlmLimits,
} from "@presentation/integrations/daySummaries";
import { LlmAuthError, LlmRateLimitError } from "@infra/integrations/llm/errors";
import type { ConfigContextValue } from "@shared/types/appConfig";
import { localISO } from "../../helpers/localTime";

function task(day: number, name = "Revisão"): Task {
  return {
    id: `t-${day}`,
    workspaceId: "ws",
    name,
    projectId: null,
    categoryId: null,
    billable: true,
    startTime: localISO(2026, 9, day, 9),
    endTime: localISO(2026, 9, day, 10),
    durationSeconds: 3600,
    status: "completed",
    createdAt: localISO(2026, 9, day, 9),
    updatedAt: localISO(2026, 9, day, 10),
    plannedTaskId: null,
    customValues: {},
  };
}

function makeDeps(cached: DaySummary[], complete: ILlmApi["complete"]) {
  return {
    taskRepo: {
      findByDateRange: vi.fn(async (start: string) => [task(new Date(start).getDate())]),
    } as never,
    daySummaryRepo: {
      findByDays: vi.fn(async () => cached),
      save: vi.fn(async () => {}),
    },
    llm: { complete: vi.fn(complete), listModels: vi.fn() },
  };
}

const OPTIONS = {
  workspaceId: "ws",
  projectNameById: () => undefined,
  todayISO: "2026-09-15",
};

describe("runDaySummaries", () => {
  it("lê o cache, regera hoje e traduz o erro de cada dia", async () => {
    const cached = [
      { dateISO: "2026-09-14", workspaceId: "ws", summary: "Ontem.", generatedAt: "x" },
      { dateISO: "2026-09-15", workspaceId: "ws", summary: "Velho.", generatedAt: "x" },
    ];
    let calls = 0;
    const deps = makeDeps(cached, async () => {
      calls++;
      if (calls === 2) throw new LlmAuthError();
      return { text: "Novo.", limits: { requestsRemaining: 9 } };
    });
    const run = await runDaySummaries(deps, {
      ...OPTIONS,
      dateISOs: ["2026-09-13", "2026-09-14", "2026-09-15"],
    });
    expect(run.summaries).toEqual([
      { dateISO: "2026-09-15", summary: "Novo.", source: "generated" },
      { dateISO: "2026-09-14", summary: "Ontem.", source: "cache" },
    ]);
    expect(run.errors).toEqual([
      { dateISO: "2026-09-13", message: "Chave inválida. Revise a chave e tente novamente." },
    ]);
    expect(run.limits).toEqual({ requestsRemaining: 9 });
  });

  it("para no limite de cota e devolve o resto como não gerado", async () => {
    const deps = makeDeps([], async () => {
      throw new LlmRateLimitError(30);
    });
    const run = await runDaySummaries(deps, {
      ...OPTIONS,
      dateISOs: ["2026-09-12", "2026-09-13", "2026-09-14"],
    });
    expect(deps.llm.complete).toHaveBeenCalledTimes(1);
    expect(run.errors[0].message).toContain("30s");
    expect(run.skipped).toEqual(["2026-09-13", "2026-09-12"]);
    expect(run.limits).toBeUndefined();
  });
});

describe("saveLlmLimits", () => {
  it("grava a cota e o instante", async () => {
    const config = { set: vi.fn(async () => {}) };
    await saveLlmLimits(config, { tokensRemaining: 10 }, "2026-09-15T12:00:00.000Z");
    expect(config.set).toHaveBeenCalledWith("llmLastLimits", { tokensRemaining: 10 });
    expect(config.set).toHaveBeenCalledWith("llmLastLimitsAt", "2026-09-15T12:00:00.000Z");
  });
});

describe("buildDaySummarySource", () => {
  function config(values: Record<string, string>) {
    return {
      isLoaded: true,
      loadError: null,
      get: vi.fn((key: string) => values[key] ?? ""),
      set: vi.fn(async () => {}),
    } as unknown as ConfigContextValue;
  }
  const factories = { createLlmApi: vi.fn(() => ({})) } as unknown as IntegrationFactories;

  it("conectado = destino e modelo, sem olhar a chave", () => {
    const source = buildDaySummarySource(
      config({ llmBaseUrl: "http://localhost:11434/v1", llmModel: "m" }),
      factories
    );
    expect(source.notConfiguredMessage).toBeNull();
  });

  it("sem modelo, não configurado", () => {
    const source = buildDaySummarySource(config({ llmBaseUrl: "http://x" }), factories);
    expect(source.notConfiguredMessage).toBe(LLM_NOT_CONNECTED);
  });
});
