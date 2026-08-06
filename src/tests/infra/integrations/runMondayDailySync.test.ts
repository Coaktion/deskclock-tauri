import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  runMondayDailySync,
  MONDAY_LOG_KEY,
  type MondayDailySyncDeps,
} from "@infra/integrations/runMondayDailySync";
import type { Task } from "@domain/entities/Task";
import type { ITaskRepository } from "@domain/repositories/ITaskRepository";
import type { ITaskIntegrationLogRepository } from "@domain/repositories/ITaskIntegrationLogRepository";
import type { ITaskSender } from "@domain/integrations/ITaskSender";

const END_DATE = "2026-07-30";
const LAST_TIMESTAMP = "2026-07-30T00:00:00.000Z";
const NOW_ISO = "2026-07-30T18:00:00.000Z";

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: "t1",
    workspaceId: "ws-1",
    name: "Reunião de alinhamento",
    projectId: "proj-1",
    categoryId: "cat-1",
    billable: true,
    startTime: "2026-07-30T12:00:00.000Z",
    endTime: "2026-07-30T13:00:00.000Z",
    durationSeconds: 3600,
    status: "completed",
    createdAt: "2026-07-30T12:00:00.000Z",
    updatedAt: "2026-07-30T13:00:00.000Z",
    customValues: {},
    ...overrides,
  };
}

function makeDeps(tasks: Task[], overrides: Partial<MondayDailySyncDeps> = {}) {
  const sender: ITaskSender = {
    integrationName: "Monday",
    send: vi.fn(async (_tasks: Task[]) => {}),
  };
  const taskRepo = { findByDateRange: vi.fn(async () => tasks) } as unknown as ITaskRepository;
  const logRepo = {
    markSent: vi.fn(async () => {}),
    findSentIds: vi.fn(async () => []),
  } as unknown as ITaskIntegrationLogRepository;
  const setTimestamp = vi.fn(async () => {});

  const deps: MondayDailySyncDeps = {
    integrationName: "Monday",
    taskRepo,
    logRepo,
    workspaceId: "ws-integracao",
    timestampPort: { get: () => LAST_TIMESTAMP, set: setTimestamp },
    validate: () => true,
    createSender: () => sender,
    nowISO: () => NOW_ISO,
    ...overrides,
  };
  return { deps, sender, taskRepo, logRepo, setTimestamp };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("runMondayDailySync", () => {
  it("entrega as tarefas cruas ao sender, que unifica internamente", async () => {
    const { deps, sender } = makeDeps([
      makeTask({ id: "a", durationSeconds: 3600 }),
      makeTask({ id: "b", durationSeconds: 1800 }),
    ]);

    const result = await runMondayDailySync(deps, END_DATE);

    expect(result).toMatchObject({ integration: "Monday", count: 1 });
    const sent = vi.mocked(sender.send).mock.calls[0][0];
    expect(sent.map((t) => t.id)).toEqual(["a", "b"]);
  });

  it("NÃO exclui tarefas já enviadas antes de agrupar — o total precisa ser absoluto", async () => {
    const { deps, sender, logRepo } = makeDeps([
      makeTask({ id: "a", durationSeconds: 3600 }),
      makeTask({ id: "b", durationSeconds: 1800 }),
    ]);
    vi.mocked(logRepo.findSentIds).mockResolvedValue(["a"]);

    await runMondayDailySync(deps, END_DATE);

    expect(logRepo.findSentIds).not.toHaveBeenCalled();
    expect(vi.mocked(sender.send).mock.calls[0][0].map((t) => t.id)).toEqual(["a", "b"]);
  });

  it("separa grupos por dia local", async () => {
    const { deps, sender } = makeDeps([
      makeTask({ id: "a", startTime: "2026-07-29T12:00:00.000Z" }),
      makeTask({ id: "b", startTime: "2026-07-30T12:00:00.000Z" }),
    ]);

    const result = await runMondayDailySync(deps, END_DATE);

    expect(result.count).toBe(2);
    expect(vi.mocked(sender.send).mock.calls[0][0]).toHaveLength(2);
  });

  it("registra markSent de todos os ids do grupo e avança o timestamp", async () => {
    const { deps, logRepo, setTimestamp } = makeDeps([
      makeTask({ id: "a" }),
      makeTask({ id: "b" }),
    ]);

    await runMondayDailySync(deps, END_DATE);

    expect(logRepo.markSent).toHaveBeenCalledWith(["a", "b"], MONDAY_LOG_KEY);
    expect(setTimestamp).toHaveBeenCalledWith(NOW_ISO);
  });

  it("avisa sobre tarefas inválidas e não as envia", async () => {
    const { deps, sender } = makeDeps(
      [makeTask({ id: "a" }), makeTask({ id: "b", workspaceId: "ws-1", projectId: null })],
      { validate: (t) => t.projectId != null }
    );

    const result = await runMondayDailySync(deps, END_DATE);

    expect(result.warning).toContain("1 tarefa(s) ignorada(s)");
    expect(vi.mocked(sender.send).mock.calls[0][0]).toHaveLength(1);
  });

  it("não marca como enviada a tarefa que o validate rejeitou", async () => {
    const { deps, logRepo } = makeDeps(
      [
        makeTask({ id: "a" }),
        makeTask({ id: "sem-board", workspaceId: "ws-1", projectId: "proj-nao-mapeado" }),
      ],
      { validate: (t) => t.projectId === "proj-1" }
    );

    await runMondayDailySync(deps, END_DATE);

    expect(logRepo.markSent).toHaveBeenCalledWith(["a"], MONDAY_LOG_KEY);
  });

  it("ignora tarefas não concluídas", async () => {
    const { deps, sender } = makeDeps([makeTask({ id: "a", status: "running", endTime: null })]);

    const result = await runMondayDailySync(deps, END_DATE);

    expect(result.count).toBe(0);
    expect(sender.send).not.toHaveBeenCalled();
  });

  it("não envia nada quando o range já foi coberto", async () => {
    const { deps, sender } = makeDeps([makeTask()], {
      timestampPort: { get: () => "2026-08-05T00:00:00.000Z", set: vi.fn(async () => {}) },
    });

    const result = await runMondayDailySync(deps, END_DATE);

    expect(result).toEqual({ integration: "Monday", count: 0 });
    expect(sender.send).not.toHaveBeenCalled();
  });

  it("devolve o erro sem marcar como enviado quando o envio falha", async () => {
    const { deps, logRepo, setTimestamp } = makeDeps([makeTask()], {
      createSender: () => ({
        integrationName: "Monday",
        send: vi.fn(async () => {
          throw new Error("Monday fora do ar");
        }),
      }),
    });

    const result = await runMondayDailySync(deps, END_DATE);

    expect(result.error?.message).toBe("Monday fora do ar");
    expect(result.count).toBe(0);
    expect(logRepo.markSent).not.toHaveBeenCalled();
    expect(setTimestamp).not.toHaveBeenCalled();
  });
});
