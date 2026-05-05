import { describe, it, expect, vi } from "vitest";
import { AutoSyncRunner } from "@infra/integrations/AutoSyncRunner";
import type { ISyncStrategy, AutoSyncResult } from "@domain/integrations/ISyncStrategy";
import type { Task } from "@domain/entities/Task";

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: "task-1",
    name: "Teste",
    projectId: "proj-1",
    categoryId: "cat-1",
    billable: true,
    startTime: new Date().toISOString(),
    endTime: new Date().toISOString(),
    durationSeconds: 3600,
    status: "completed",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

function makeStrategy(
  name: string,
  perTaskEnabled: boolean,
  dailyEnabled: boolean,
  perTaskResult: AutoSyncResult,
  dailyResult: AutoSyncResult
): ISyncStrategy {
  return {
    integrationName: name,
    isPerTaskEnabled: vi.fn().mockReturnValue(perTaskEnabled),
    isDailyEnabled: vi.fn().mockReturnValue(dailyEnabled),
    runPerTask: vi.fn().mockResolvedValue(perTaskResult),
    runDaily: vi.fn().mockResolvedValue(dailyResult),
  };
}

describe("AutoSyncRunner", () => {
  it("runPerTask chama apenas estratégias com isPerTaskEnabled = true", async () => {
    const enabled = makeStrategy(
      "A",
      true,
      false,
      { integration: "A", count: 1 },
      { integration: "A", count: 0 }
    );
    const disabled = makeStrategy(
      "B",
      false,
      false,
      { integration: "B", count: 0 },
      { integration: "B", count: 0 }
    );
    const runner = new AutoSyncRunner([enabled, disabled]);
    const results = await runner.runPerTask(makeTask());

    expect(enabled.runPerTask).toHaveBeenCalledOnce();
    expect(disabled.runPerTask).not.toHaveBeenCalled();
    expect(results).toHaveLength(1);
    expect(results[0].integration).toBe("A");
  });

  it("runPerTask retorna array vazio quando nenhuma estratégia está habilitada", async () => {
    const disabled = makeStrategy(
      "A",
      false,
      false,
      { integration: "A", count: 0 },
      { integration: "A", count: 0 }
    );
    const runner = new AutoSyncRunner([disabled]);
    const results = await runner.runPerTask(makeTask());
    expect(results).toHaveLength(0);
  });

  it("runDaily chama apenas estratégias com isDailyEnabled = true", async () => {
    const enabled = makeStrategy(
      "A",
      false,
      true,
      { integration: "A", count: 0 },
      { integration: "A", count: 5 }
    );
    const disabled = makeStrategy(
      "B",
      false,
      false,
      { integration: "B", count: 0 },
      { integration: "B", count: 0 }
    );
    const runner = new AutoSyncRunner([enabled, disabled]);
    const results = await runner.runDaily("2026-05-04");

    expect(enabled.runDaily).toHaveBeenCalledWith("2026-05-04");
    expect(disabled.runDaily).not.toHaveBeenCalled();
    expect(results).toHaveLength(1);
    expect(results[0].count).toBe(5);
  });

  it("runPerTask agrega resultados de múltiplas estratégias habilitadas", async () => {
    const stratA = makeStrategy(
      "A",
      true,
      false,
      { integration: "A", count: 1 },
      { integration: "A", count: 0 }
    );
    const stratB = makeStrategy(
      "B",
      true,
      false,
      { integration: "B", count: 1 },
      { integration: "B", count: 0 }
    );
    const runner = new AutoSyncRunner([stratA, stratB]);
    const results = await runner.runPerTask(makeTask());

    expect(results).toHaveLength(2);
    expect(results.map((r) => r.integration)).toEqual(["A", "B"]);
  });
});
