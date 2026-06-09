import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  calcDailyRange,
  runDailyTemplate,
  type DailyTemplateDeps,
} from "@infra/integrations/runDailyTemplate";
import type { Task } from "@domain/entities/Task";
import type { ITaskRepository } from "@domain/repositories/ITaskRepository";
import type { ITaskIntegrationLogRepository } from "@domain/repositories/ITaskIntegrationLogRepository";
import type { ITaskSender } from "@domain/integrations/ITaskSender";
import { startOfDayISO, endOfDayISO, addDaysISO } from "@shared/utils/time";

const TODAY = "2026-05-06";
const NOW_ISO = "2026-05-06T15:00:00.000Z";

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: "t1",
    name: "Tarefa teste",
    projectId: "proj-1",
    categoryId: "cat-1",
    billable: true,
    startTime: "2026-05-06T09:00:00.000Z",
    endTime: "2026-05-06T10:00:00.000Z",
    durationSeconds: 3600,
    status: "completed",
    createdAt: "2026-05-06T09:00:00.000Z",
    updatedAt: "2026-05-06T10:00:00.000Z",
    ...overrides,
  };
}

function makeTaskRepo(tasks: Task[] = []): ITaskRepository {
  return {
    findByDateRange: vi.fn().mockResolvedValue(tasks),
  } as unknown as ITaskRepository;
}

function makeLogRepo(sentIds: string[] = []): ITaskIntegrationLogRepository {
  return {
    findSentIds: vi.fn().mockResolvedValue(sentIds),
    markSent: vi.fn().mockResolvedValue(undefined),
  } as unknown as ITaskIntegrationLogRepository;
}

function makeSender(): ITaskSender {
  return {
    integrationName: "TestInteg",
    send: vi.fn().mockResolvedValue(undefined),
  };
}

function makeDeps(overrides: Partial<DailyTemplateDeps> = {}): DailyTemplateDeps {
  return {
    integrationName: "TestInteg",
    integrationLabel: "TestInteg",
    logKey: "test_key",
    taskRepo: makeTaskRepo(),
    logRepo: makeLogRepo(),
    timestampPort: {
      get: vi.fn().mockReturnValue(""),
      set: vi.fn().mockResolvedValue(undefined),
    },
    validate: () => true,
    createSender: vi.fn().mockReturnValue(makeSender()),
    nowISO: () => NOW_ISO,
    ...overrides,
  };
}

// ---- calcDailyRange ----

describe("calcDailyRange", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-06T12:00:00Z"));
  });
  afterEach(() => vi.useRealTimers());

  it("timestamp vazio → start = startOfDay(today-7), end = endOfDay(endDateISO)", () => {
    const result = calcDailyRange("", TODAY);
    expect(result).not.toBeNull();
    expect(result!.start).toBe(startOfDayISO(addDaysISO(TODAY, -7)));
    expect(result!.end).toBe(endOfDayISO(TODAY));
  });

  it("timestamp = ontem → start = startOfDay(ontem)", () => {
    const result = calcDailyRange("2026-05-05T10:00:00.000Z", TODAY);
    expect(result).not.toBeNull();
    expect(result!.start).toBe(startOfDayISO("2026-05-05"));
    expect(result!.end).toBe(endOfDayISO(TODAY));
  });

  it("timestamp = hoje → range cobre hoje (dedup via log)", () => {
    const result = calcDailyRange("2026-05-06T10:00:00.000Z", TODAY);
    expect(result).not.toBeNull();
    expect(result!.start).toBe(startOfDayISO(TODAY));
    expect(result!.end).toBe(endOfDayISO(TODAY));
  });

  it("timestamp = futuro → null", () => {
    expect(calcDailyRange("2026-05-10T10:00:00.000Z", TODAY)).toBeNull();
  });
});

// ---- runDailyTemplate ----

describe("runDailyTemplate", () => {
  it("range nulo (timestamp futuro) → {count: 0}, nenhum repo chamado", async () => {
    const taskRepo = makeTaskRepo();
    const deps = makeDeps({
      taskRepo,
      timestampPort: { get: () => "2026-05-10T10:00:00.000Z", set: vi.fn() },
    });
    const result = await runDailyTemplate(deps, TODAY);
    expect(result).toEqual({ integration: "TestInteg", count: 0 });
    expect(taskRepo.findByDateRange as ReturnType<typeof vi.fn>).not.toHaveBeenCalled();
    expect(deps.createSender as ReturnType<typeof vi.fn>).not.toHaveBeenCalled();
  });

  it("sem tasks completed → {count: 0}, sem warning, sender não chamado", async () => {
    const tasks = [
      makeTask({ status: "running" as Task["status"] }),
      makeTask({ id: "t2", status: "paused" as Task["status"] }),
    ];
    const deps = makeDeps({
      taskRepo: makeTaskRepo(tasks),
      timestampPort: { get: () => "2026-05-04T10:00:00.000Z", set: vi.fn() },
    });
    const result = await runDailyTemplate(deps, TODAY);
    expect(result.count).toBe(0);
    expect(result.warning).toBeUndefined();
    expect(deps.createSender as ReturnType<typeof vi.fn>).not.toHaveBeenCalled();
  });

  it("algumas inválidas → warning com count exato; só válidas enviadas", async () => {
    const valid = makeTask({ id: "t1", name: "ok" });
    const invalid1 = makeTask({ id: "t2", name: "bad1" });
    const invalid2 = makeTask({ id: "t3", name: "bad2" });
    const logRepo = makeLogRepo([]);
    const sender = makeSender();
    const deps = makeDeps({
      taskRepo: makeTaskRepo([valid, invalid1, invalid2]),
      logRepo,
      validate: (t: Task) => t.id === "t1",
      createSender: () => sender,
      timestampPort: { get: () => "2026-05-04T10:00:00.000Z", set: vi.fn() },
    });
    const result = await runDailyTemplate(deps, TODAY);
    expect(result.warning).toBe(
      "2 tarefa(s) ignorada(s) no envio diário ao TestInteg: dados incompletos."
    );
    expect(result.count).toBe(1);
    expect(sender.send as ReturnType<typeof vi.fn>).toHaveBeenCalledWith([
      expect.objectContaining({ id: "t1" }),
    ]);
  });

  it("todas já enviadas → {count: 0}, sender NÃO chamado, timestamp NÃO atualizado", async () => {
    const task = makeTask({ id: "t1" });
    const logRepo = makeLogRepo(["t1"]);
    const tsSet = vi.fn();
    const deps = makeDeps({
      taskRepo: makeTaskRepo([task]),
      logRepo,
      timestampPort: { get: () => "2026-05-04T10:00:00.000Z", set: tsSet },
    });
    const result = await runDailyTemplate(deps, TODAY);
    expect(result.count).toBe(0);
    expect(deps.createSender as ReturnType<typeof vi.fn>).not.toHaveBeenCalled();
    expect(tsSet).not.toHaveBeenCalled();
  });

  it("caso feliz: 3 grupos / 5 tasks → count=3; sender com 3 tasks; markSent com 5 ids; timestamp atualizado", async () => {
    const tasks = [
      makeTask({ id: "t1", name: "A", projectId: "p1", categoryId: "c1", durationSeconds: 1000 }),
      makeTask({ id: "t2", name: "A", projectId: "p1", categoryId: "c1", durationSeconds: 500 }),
      makeTask({ id: "t3", name: "B", projectId: "p1", categoryId: "c1", durationSeconds: 1800 }),
      makeTask({ id: "t4", name: "B", projectId: "p1", categoryId: "c1", durationSeconds: 600 }),
      makeTask({ id: "t5", name: "C", projectId: "p2", categoryId: "c1", durationSeconds: 900 }),
    ];
    const logRepo = makeLogRepo([]);
    const sender = makeSender();
    const tsSet = vi.fn().mockResolvedValue(undefined);
    const deps = makeDeps({
      taskRepo: makeTaskRepo(tasks),
      logRepo,
      createSender: () => sender,
      timestampPort: { get: () => "2026-05-04T10:00:00.000Z", set: tsSet },
    });
    const result = await runDailyTemplate(deps, TODAY);
    expect(result.count).toBe(3);
    expect(result.error).toBeUndefined();

    expect(sender.send as ReturnType<typeof vi.fn>).toHaveBeenCalledOnce();
    const sentTasks: Task[] = (sender.send as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(sentTasks).toHaveLength(3);

    const sentA = sentTasks.find((t) => t.name === "A");
    expect(sentA!.durationSeconds).toBe(1500);
    const sentB = sentTasks.find((t) => t.name === "B");
    expect(sentB!.durationSeconds).toBe(2400);

    expect(logRepo.markSent as ReturnType<typeof vi.fn>).toHaveBeenCalledWith(
      expect.arrayContaining(["t1", "t2", "t3", "t4", "t5"]),
      "test_key"
    );
    expect(tsSet).toHaveBeenCalledWith(NOW_ISO);
  });

  it("mesma chave nome|projeto|categoria em dias diferentes → não funde: envia um registro por dia, cada um com sua data e duração", async () => {
    // Datas construídas em horário local para o teste não depender do fuso da máquina
    const yesterdayStart = new Date(2026, 4, 5, 9, 0).toISOString();
    const todayStart = new Date(2026, 4, 6, 9, 0).toISOString();
    const tasks = [
      makeTask({ id: "t1", name: "Daily", startTime: yesterdayStart, durationSeconds: 1800 }),
      makeTask({ id: "t2", name: "Daily", startTime: todayStart, durationSeconds: 2700 }),
    ];
    const sender = makeSender();
    const deps = makeDeps({
      taskRepo: makeTaskRepo(tasks),
      logRepo: makeLogRepo([]),
      createSender: () => sender,
      timestampPort: { get: () => "2026-05-04T10:00:00.000Z", set: vi.fn() },
    });
    const result = await runDailyTemplate(deps, TODAY);
    expect(result.count).toBe(2);

    const sentTasks: Task[] = (sender.send as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(sentTasks).toHaveLength(2);
    const sentYesterday = sentTasks.find((t) => t.startTime === yesterdayStart);
    const sentToday = sentTasks.find((t) => t.startTime === todayStart);
    expect(sentYesterday!.durationSeconds).toBe(1800);
    expect(sentToday!.durationSeconds).toBe(2700);
  });

  it("tarefa de ontem já enviada + nova de hoje com mesma chave → envia só a de hoje, sem somar a de ontem", async () => {
    const yesterdayStart = new Date(2026, 4, 5, 9, 0).toISOString();
    const todayStart = new Date(2026, 4, 6, 9, 0).toISOString();
    const tasks = [
      makeTask({ id: "t1", name: "Daily", startTime: yesterdayStart, durationSeconds: 1800 }),
      makeTask({ id: "t2", name: "Daily", startTime: todayStart, durationSeconds: 2700 }),
    ];
    const logRepo = makeLogRepo(["t1"]);
    const sender = makeSender();
    const deps = makeDeps({
      taskRepo: makeTaskRepo(tasks),
      logRepo,
      createSender: () => sender,
      timestampPort: { get: () => "2026-05-04T10:00:00.000Z", set: vi.fn() },
    });
    const result = await runDailyTemplate(deps, TODAY);
    expect(result.count).toBe(1);

    const sentTasks: Task[] = (sender.send as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(sentTasks).toHaveLength(1);
    expect(sentTasks[0].startTime).toBe(todayStart);
    expect(sentTasks[0].durationSeconds).toBe(2700);
    expect(logRepo.markSent as ReturnType<typeof vi.fn>).toHaveBeenCalledWith(["t2"], "test_key");
  });

  it("grupo parcialmente enviado no mesmo dia → reenvia apenas a duração das tarefas não enviadas", async () => {
    const morning = new Date(2026, 4, 6, 9, 0).toISOString();
    const afternoon = new Date(2026, 4, 6, 14, 0).toISOString();
    const tasks = [
      makeTask({ id: "t1", name: "A", startTime: morning, durationSeconds: 1800 }),
      makeTask({ id: "t2", name: "A", startTime: afternoon, durationSeconds: 2700 }),
    ];
    const logRepo = makeLogRepo(["t1"]);
    const sender = makeSender();
    const deps = makeDeps({
      taskRepo: makeTaskRepo(tasks),
      logRepo,
      createSender: () => sender,
      timestampPort: { get: () => "2026-05-06T10:00:00.000Z", set: vi.fn() },
    });
    const result = await runDailyTemplate(deps, TODAY);
    expect(result.count).toBe(1);

    const sentTasks: Task[] = (sender.send as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(sentTasks).toHaveLength(1);
    expect(sentTasks[0].durationSeconds).toBe(2700);
    expect(logRepo.markSent as ReturnType<typeof vi.fn>).toHaveBeenCalledWith(["t2"], "test_key");
  });

  it("sender lança erro → {count: 0, error}; markSent NÃO chamado; timestamp NÃO atualizado", async () => {
    const task = makeTask();
    const logRepo = makeLogRepo([]);
    const sender = { integrationName: "TestInteg", send: vi.fn().mockRejectedValue(new Error("network failure")) };
    const tsSet = vi.fn();
    const deps = makeDeps({
      taskRepo: makeTaskRepo([task]),
      logRepo,
      createSender: () => sender,
      timestampPort: { get: () => "2026-05-04T10:00:00.000Z", set: tsSet },
    });
    const result = await runDailyTemplate(deps, TODAY);
    expect(result.count).toBe(0);
    expect(result.error?.message).toBe("network failure");
    expect(logRepo.markSent as ReturnType<typeof vi.fn>).not.toHaveBeenCalled();
    expect(tsSet).not.toHaveBeenCalled();
  });

  it("validate: () => true (cenário UI) → zero invalids, warning undefined, flow normal", async () => {
    const tasks = [makeTask({ id: "t1" }), makeTask({ id: "t2", name: "outra" })];
    const logRepo = makeLogRepo([]);
    const sender = makeSender();
    const deps = makeDeps({
      taskRepo: makeTaskRepo(tasks),
      logRepo,
      validate: () => true,
      createSender: () => sender,
      timestampPort: { get: () => "2026-05-04T10:00:00.000Z", set: vi.fn() },
    });
    const result = await runDailyTemplate(deps, TODAY);
    expect(result.warning).toBeUndefined();
    expect(sender.send as ReturnType<typeof vi.fn>).toHaveBeenCalledOnce();
  });
});
