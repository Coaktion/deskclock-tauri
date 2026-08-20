import { describe, it, expect, vi } from "vitest";
import { AutoSyncRunner } from "@infra/integrations/AutoSyncRunner";
import type { ISyncStrategy, AutoSyncResult } from "@domain/integrations/ISyncStrategy";
import type { Task } from "@domain/entities/Task";

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: "task-1",
    workspaceId: "ws-1",
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
    customValues: {},
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

  it("runDailyFor chama só a integração pedida, mesmo com outra habilitada", async () => {
    const monday = makeStrategy(
      "Monday",
      false,
      false,
      { integration: "Monday", count: 0 },
      { integration: "Monday", count: 3 }
    );
    const sheets = makeStrategy(
      "Google Sheets",
      false,
      true,
      { integration: "Google Sheets", count: 0 },
      { integration: "Google Sheets", count: 9 }
    );
    const runner = new AutoSyncRunner([monday, sheets]);
    const result = await runner.runDailyFor("Monday", "2026-05-04");

    expect(monday.runDaily).toHaveBeenCalledWith("2026-05-04");
    expect(sheets.runDaily).not.toHaveBeenCalled();
    expect(result?.count).toBe(3);
  });

  it("runDailyFor devolve null quando a integração não está registrada", async () => {
    const runner = new AutoSyncRunner([]);
    expect(await runner.runDailyFor("Monday", "2026-05-04")).toBeNull();
  });

  it("runDailyFor marca isSyncing durante a execução", async () => {
    let resolveRun: (v: AutoSyncResult) => void = () => {};
    const pending = new Promise<AutoSyncResult>((r) => (resolveRun = r));
    const strat: ISyncStrategy = {
      integrationName: "Monday",
      isPerTaskEnabled: () => false,
      isDailyEnabled: () => false,
      runPerTask: vi.fn(),
      runDaily: vi.fn().mockReturnValue(pending),
    };
    const runner = new AutoSyncRunner([strat]);

    const promise = runner.runDailyFor("Monday", "2026-05-04");
    expect(runner.isSyncing("Monday")).toBe(true);

    resolveRun({ integration: "Monday", count: 0 });
    await promise;
    expect(runner.isSyncing("Monday")).toBe(false);
  });

  it("isSyncing fica true durante runDaily e volta a false depois", async () => {
    let resolveRun: (v: AutoSyncResult) => void = () => {};
    const pending = new Promise<AutoSyncResult>((r) => (resolveRun = r));
    const strat: ISyncStrategy = {
      integrationName: "Google Sheets",
      isPerTaskEnabled: () => false,
      isDailyEnabled: () => true,
      runPerTask: vi.fn(),
      runDaily: vi.fn().mockReturnValue(pending),
    };
    const runner = new AutoSyncRunner([strat]);

    const promise = runner.runDaily("2026-05-04");
    expect(runner.isSyncing("Google Sheets")).toBe(true);
    expect(runner.isSyncing()).toBe(true);

    resolveRun({ integration: "Google Sheets", count: 0 });
    await promise;
    expect(runner.isSyncing("Google Sheets")).toBe(false);
    expect(runner.isSyncing()).toBe(false);
  });

  it("isSyncing usa refcount para chamadas concorrentes na mesma integração", async () => {
    let resolveA: (v: AutoSyncResult) => void = () => {};
    let resolveB: (v: AutoSyncResult) => void = () => {};
    const pendA = new Promise<AutoSyncResult>((r) => (resolveA = r));
    const pendB = new Promise<AutoSyncResult>((r) => (resolveB = r));
    const runPerTask = vi.fn().mockReturnValueOnce(pendA).mockReturnValueOnce(pendB);
    const strat: ISyncStrategy = {
      integrationName: "Google Sheets",
      isPerTaskEnabled: () => true,
      isDailyEnabled: () => false,
      runPerTask,
      runDaily: vi.fn(),
    };
    const runner = new AutoSyncRunner([strat]);
    const task = makeTask();

    const p1 = runner.runPerTask(task);
    const p2 = runner.runPerTask(task);
    expect(runner.isSyncing("Google Sheets")).toBe(true);

    resolveA({ integration: "Google Sheets", count: 1 });
    await p1;
    expect(runner.isSyncing("Google Sheets")).toBe(true);

    resolveB({ integration: "Google Sheets", count: 1 });
    await p2;
    expect(runner.isSyncing("Google Sheets")).toBe(false);
  });

  it("isSyncing só conta estratégias habilitadas para o modo invocado", async () => {
    let resolveSheets: (v: AutoSyncResult) => void = () => {};
    const pending = new Promise<AutoSyncResult>((r) => (resolveSheets = r));
    const sheets: ISyncStrategy = {
      integrationName: "Google Sheets",
      isPerTaskEnabled: () => false,
      isDailyEnabled: () => true,
      runPerTask: vi.fn(),
      runDaily: vi.fn().mockReturnValue(pending),
    };
    const clockify = makeStrategy(
      "Clockify",
      false,
      false,
      { integration: "Clockify", count: 0 },
      { integration: "Clockify", count: 0 }
    );
    const runner = new AutoSyncRunner([sheets, clockify]);

    const promise = runner.runDaily("2026-05-04");
    expect(runner.isSyncing("Google Sheets")).toBe(true);
    expect(runner.isSyncing("Clockify")).toBe(false);

    resolveSheets({ integration: "Google Sheets", count: 0 });
    await promise;
  });

  it("subscribe notifica em cada mudança de estado e devolve unsubscribe", async () => {
    let resolveRun: (v: AutoSyncResult) => void = () => {};
    const pending = new Promise<AutoSyncResult>((r) => (resolveRun = r));
    const strat: ISyncStrategy = {
      integrationName: "Google Sheets",
      isPerTaskEnabled: () => false,
      isDailyEnabled: () => true,
      runPerTask: vi.fn(),
      runDaily: vi.fn().mockReturnValue(pending),
    };
    const runner = new AutoSyncRunner([strat]);
    const listener = vi.fn();
    const unsubscribe = runner.subscribe(listener);

    const promise = runner.runDaily("2026-05-04");
    expect(listener).toHaveBeenCalledTimes(1);

    resolveRun({ integration: "Google Sheets", count: 0 });
    await promise;
    expect(listener).toHaveBeenCalledTimes(2);

    unsubscribe();
    await runner.runDaily("2026-05-04");
    expect(listener).toHaveBeenCalledTimes(2);
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
