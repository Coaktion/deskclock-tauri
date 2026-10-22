import { describe, it, expect, vi } from "vitest";
import type { Task } from "@domain/entities/Task";
import type { TaskGroup } from "@domain/utils/groupTasks";
import type { ITaskSender, TaskSendOutcome } from "@domain/integrations/ITaskSender";
import {
  buildSendPayload,
  sendBlockedReason,
  sendTaskGroups,
  type TaskSendTarget,
} from "@domain/usecases/tasks/SendTaskGroups";
import { NoIntegrationError } from "@domain/usecases/tasks/SendTasks";
import { localISO } from "../../../helpers/localTime";

function makeTask(id: string, durationSeconds = 600): Task {
  return {
    id,
    workspaceId: "ws-1",
    name: "Tarefa",
    projectId: "p1",
    categoryId: "c1",
    billable: true,
    startTime: localISO(2026, 9, 15, 9),
    endTime: localISO(2026, 9, 15, 10),
    durationSeconds,
    status: "completed",
    createdAt: localISO(2026, 9, 15, 9),
    updatedAt: localISO(2026, 9, 15, 10),
    customValues: {},
  };
}

function group(key: string, tasks: Task[]): TaskGroup {
  return { key, tasks, totalSeconds: tasks.reduce((s, t) => s + (t.durationSeconds ?? 0), 0) };
}

const GROUPS = [group("g1", [makeTask("a1"), makeTask("a2", 300)]), group("g2", [makeTask("b1")])];

function makeSender(outcome: Partial<TaskSendOutcome> = {}) {
  return {
    integrationName: "Teste",
    send: vi.fn(async (tasks: Task[]) => ({
      sentTaskIds: tasks.map((t) => t.id),
      refused: [],
      failed: [],
      ...outcome,
    })),
  } satisfies ITaskSender;
}

function makeTarget(overrides: Partial<TaskSendTarget> = {}) {
  return {
    integrationId: "google_sheets",
    sender: makeSender(),
    onSendSuccess: vi.fn(async () => {}),
    ...overrides,
  } satisfies TaskSendTarget;
}

function makeLogRepo() {
  return { markSent: vi.fn(async () => {}), findSentIds: vi.fn(async () => []) };
}

describe("buildSendPayload", () => {
  it("sem sendsRawTasks vai um representante por grupo, com a duração somada", () => {
    const payload = buildSendPayload(GROUPS, false);
    expect(payload.map((t) => [t.id, t.durationSeconds])).toEqual([
      ["a1", 900],
      ["b1", 600],
    ]);
  });

  it("com sendsRawTasks vão as tarefas cruas", () => {
    expect(buildSendPayload(GROUPS, true).map((t) => t.id)).toEqual(["a1", "a2", "b1"]);
  });
});

describe("sendTaskGroups", () => {
  it("marca o grupo inteiro do representante e avança o timestamp no envio limpo", async () => {
    const target = makeTarget();
    const logRepo = makeLogRepo();

    const result = await sendTaskGroups(target, GROUPS, logRepo);

    expect(result.kind).toBe("sent");
    expect(logRepo.markSent).toHaveBeenCalledWith(["a1", "a2", "b1"], "google_sheets");
    expect(target.onSendSuccess).toHaveBeenCalledWith(["a1", "a2", "b1"]);
  });

  it("marca só o que subiu e não avança o timestamp com recusa", async () => {
    const target = makeTarget({
      sender: makeSender({ sentTaskIds: ["b1"], refused: ['"Tarefa": sem motivo.'] }),
    });
    const logRepo = makeLogRepo();

    const result = await sendTaskGroups(target, GROUPS, logRepo);

    expect(logRepo.markSent).toHaveBeenCalledWith(["b1"], "google_sheets");
    expect(target.onSendSuccess).not.toHaveBeenCalled();
    expect(result.kind === "sent" && result.sent.fullySentGroups).toBe(1);
  });

  it("não avança o timestamp com falha técnica", async () => {
    const target = makeTarget({
      sender: makeSender({ sentTaskIds: ["a1"], failed: ["rede"] }),
    });
    await sendTaskGroups(target, GROUPS, makeLogRepo());
    expect(target.onSendSuccess).not.toHaveBeenCalled();
  });

  it("nada enviado não marca nem avança", async () => {
    const target = makeTarget({ sender: makeSender({ sentTaskIds: [], refused: ["x"] }) });
    const logRepo = makeLogRepo();
    await sendTaskGroups(target, GROUPS, logRepo);
    expect(logRepo.markSent).not.toHaveBeenCalled();
    expect(target.onSendSuccess).not.toHaveBeenCalled();
  });

  it("no modo cru marca exatamente os ids confirmados", async () => {
    const sender = makeSender({ sentTaskIds: ["a1", "b1"], refused: ["a2 recusada"] });
    const target = makeTarget({ integrationId: "monday", sendsRawTasks: true, sender });
    const logRepo = makeLogRepo();
    await sendTaskGroups(target, GROUPS, logRepo);
    expect(sender.send.mock.calls[0][0].map((t: Task) => t.id)).toEqual(["a1", "a2", "b1"]);
    expect(logRepo.markSent).toHaveBeenCalledWith(["a1", "b1"], "monday");
  });

  it("a validação antes de enviar barra sem chamar o sender", async () => {
    const validateBeforeSend = vi.fn((tasks: Task[]) => `faltam ${tasks.length}`);
    const sender = makeSender();
    const target = makeTarget({ validateBeforeSend, sender });
    const logRepo = makeLogRepo();

    const result = await sendTaskGroups(target, GROUPS, logRepo);

    expect(result).toEqual({ kind: "blocked", message: "faltam 2" });
    expect(sender.send).not.toHaveBeenCalled();
    expect(logRepo.markSent).not.toHaveBeenCalled();
    // Recebe a mesma carga que o sender receberia.
    expect(sendBlockedReason(target, GROUPS)).toBe("faltam 2");
  });

  it("integração não configurada lança NoIntegrationError", async () => {
    await expect(
      sendTaskGroups(makeTarget({ sender: null }), GROUPS, makeLogRepo())
    ).rejects.toBeInstanceOf(NoIntegrationError);
  });
});
